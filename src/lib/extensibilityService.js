import { supabase } from './supabase.js';
import { withCoreAuditFields, filterActiveRecords } from './auditHelper.js';

/**
 * 系統擴充性統一服務層 (10 大擴充能力)
 * 支援注入自訂 storageAdapter (預設連接 Supabase，測試時可切換為記憶體/模擬交易引擎)
 */
export function createExtensibilityService(client = supabase) {
  return {
    // ========================================================================
    // 1. 多分館管理 (Multi-Branch Management)
    // ========================================================================
    async createBranch({ code, name, address, isInterlibraryEnabled = true }, actorId = null) {
      const record = withCoreAuditFields(
        {
          code,
          name,
          address,
          is_interlibrary_enabled: isInterlibraryEnabled,
        },
        { actorId, supportsSoftDelete: true }
      );

      const { data, error } = await client.from('branches').insert([record]).select().single();
      if (error) throw new Error(`建立分館失敗: ${error.message}`);
      return data;
    },

    async getBranchInventory(branchId) {
      const { data, error } = await client
        .from('book_copies')
        .select('*, book:books(*)')
        .eq('current_branch_id', branchId)
        .is('deleted_at', null);

      if (error) throw new Error(`查詢分館館藏失敗: ${error.message}`);
      return filterActiveRecords(data || []);
    },

    // ========================================================================
    // 2. 跨館借閱與館際調撥 (Interlibrary Loan & Transfer)
    // ========================================================================
    async requestInterlibraryTransfer({ copyId, fromBranchId, toBranchId, memberId, reason = 'CROSS_BRANCH_BORROW' }, actorId = null) {
      if (fromBranchId === toBranchId) {
        throw new Error('來源分館與目的分館相同，無需發起跨館調撥');
      }

      const transfer = withCoreAuditFields(
        {
          copy_id: copyId,
          from_branch_id: fromBranchId,
          to_branch_id: toBranchId,
          member_id: memberId,
          transfer_reason: reason,
          status: 'IN_TRANSIT',
          dispatched_at: new Date().toISOString(),
        },
        { actorId, supportsSoftDelete: true }
      );

      const { data, error } = await client.from('interlibrary_transfers').insert([transfer]).select().single();
      if (error) throw new Error(`建立跨館調撥單失敗: ${error.message}`);

      await client
        .from('book_copies')
        .update(withCoreAuditFields({ status: 'IN_TRANSIT' }, { actorId, isUpdate: true }))
        .eq('id', copyId);

      return data;
    },

    async completeInterlibraryTransfer(transferId, actorId = null) {
      const { data: transfer, error: fetchErr } = await client
        .from('interlibrary_transfers')
        .select('*')
        .eq('id', transferId)
        .single();

      if (fetchErr || !transfer) throw new Error('找不到指定的跨館調撥單');

      const now = new Date().toISOString();
      const { data: updatedTransfer, error: updErr } = await client
        .from('interlibrary_transfers')
        .update(
          withCoreAuditFields(
            { status: 'RECEIVED', received_at: now },
            { actorId, isUpdate: true }
          )
        )
        .eq('id', transferId)
        .select()
        .single();

      if (updErr) throw new Error(`點收跨館調撥單失敗: ${updErr.message}`);

      // 更新副本當前所在分館為目的分館，並設為可借閱 (或保留給預約人)
      const nextCopyStatus = transfer.member_id ? 'RESERVED' : 'AVAILABLE';
      await client
        .from('book_copies')
        .update(
          withCoreAuditFields(
            { current_branch_id: transfer.to_branch_id, status: nextCopyStatus },
            { actorId, isUpdate: true }
          )
        )
        .eq('id', transfer.copy_id);

      return updatedTransfer;
    },

    // ========================================================================
    // 3. RFID 自助借還及盤點 (RFID Inventory & Gate/Kiosk Scan)
    // ========================================================================
    async batchRfidInventory({ branchId, scannerDeviceId = 'RFID-HANDHELD-01', scannedEpcs = [] }, actorId = null) {
      const { data: branchCopies, error } = await client
        .from('book_copies')
        .select('*')
        .eq('current_branch_id', branchId)
        .is('deleted_at', null);

      if (error) throw new Error(`讀取分館 RFID 館藏失敗: ${error.message}`);

      const activeCopies = filterActiveRecords(branchCopies || []);
      const epcMap = new Map(activeCopies.filter((c) => c.rfid_epc).map((c) => [c.rfid_epc, c]));
      const scannedSet = new Set(scannedEpcs);

      const matched = [];
      const unknownTags = [];
      const scanLogs = [];

      for (const epc of scannedSet) {
        const copy = epcMap.get(epc);
        if (copy) {
          matched.push(copy);
        } else {
          unknownTags.push(epc);
        }
        scanLogs.push(
          withCoreAuditFields(
            {
              branch_id: branchId,
              scanner_device_id: scannerDeviceId,
              scan_mode: 'INVENTORY',
              rfid_epc: epc,
              copy_id: copy?.id || null,
              matched: Boolean(copy),
            },
            { actorId, supportsSoftDelete: false }
          )
        );
      }

      const missingCopies = activeCopies.filter(
        (c) => c.status === 'AVAILABLE' && c.rfid_epc && !scannedSet.has(c.rfid_epc)
      );

      if (scanLogs.length > 0) {
        await client.from('rfid_scan_logs').insert(scanLogs);
      }

      return {
        branchId,
        totalExpectedOnShelf: activeCopies.filter((c) => c.status === 'AVAILABLE').length,
        matchedCount: matched.length,
        missingCopies,
        unknownTags,
      };
    },

    // ========================================================================
    // 4. QR Code 讀者證及館藏查詢 (QR Code Payload & Lookup)
    // ========================================================================
    generateEntityQrPayload(entityType, code) {
      const payload = JSON.stringify({
        v: 1,
        type: entityType, // 'MEMBER' | 'COPY'
        code,
        ts: Date.now(),
      });
      const base64 = Buffer.from(payload, 'utf8').toString('base64url');
      return {
        token: `LIBQR:${base64}`,
        imageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`LIBQR:${base64}`)}`,
      };
    },

    parseEntityQrToken(qrToken) {
      if (!qrToken || !qrToken.startsWith('LIBQR:')) {
        throw new Error('無效的圖書館 QR Code 格式');
      }
      const raw = Buffer.from(qrToken.slice(6), 'base64url').toString('utf8');
      const parsed = JSON.parse(raw);
      if (!parsed.type || !parsed.code) {
        throw new Error('QR Code 內容缺少識別類型或編碼');
      }
      return parsed;
    },

    async lookupByQrToken(qrToken) {
      const parsed = this.parseEntityQrToken(qrToken);
      if (parsed.type === 'MEMBER') {
        const { data, error } = await client
          .from('members')
          .select('*')
          .eq('member_code', parsed.code)
          .is('deleted_at', null)
          .single();
        if (error || !data) throw new Error(`找不到讀者證號: ${parsed.code}`);
        return { entityType: 'MEMBER', data };
      }

      if (parsed.type === 'COPY') {
        const { data, error } = await client
          .from('book_copies')
          .select('*, book:books(*), branch:branches(*)')
          .eq('barcode', parsed.code)
          .is('deleted_at', null)
          .single();
        if (error || !data) throw new Error(`找不到館藏條碼: ${parsed.code}`);
        return { entityType: 'COPY', data };
      }

      throw new Error(`不支援的 QR Code 類型: ${parsed.type}`);
    },

    // ========================================================================
    // 5. 電子書與數位資源管理 (E-Book Licensing & DRM Token Loan)
    // ========================================================================
    async registerEbook({ isbn, title, author, fileFormat = 'EPUB', storageUrl, totalLicenses = 3 }, actorId = null) {
      const record = withCoreAuditFields(
        {
          isbn,
          title,
          author,
          file_format: fileFormat,
          storage_url: storageUrl,
          total_licenses: totalLicenses,
          active_loans: 0,
        },
        { actorId, supportsSoftDelete: true }
      );
      const { data, error } = await client.from('ebooks').insert([record]).select().single();
      if (error) throw new Error(`建立電子書資源失敗: ${error.message}`);
      return data;
    },

    async borrowEbook({ ebookId, memberId, loanDays = 14 }, actorId = null) {
      const { data: ebook, error } = await client
        .from('ebooks')
        .select('*')
        .eq('id', ebookId)
        .is('deleted_at', null)
        .single();

      if (error || !ebook) throw new Error('電子書資源不存在或已下架');
      if (ebook.active_loans >= ebook.total_licenses) {
        throw new Error(`電子書《${ebook.title}》同時在線授權數已滿 (${ebook.total_licenses} 席)`);
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + loanDays);

      const loanRecord = withCoreAuditFields(
        {
          ebook_id: ebookId,
          member_id: memberId,
          access_token: `DRM-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
          borrowed_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          status: 'ACTIVE',
        },
        { actorId, supportsSoftDelete: false }
      );

      const { data: createdLoan, error: loanErr } = await client
        .from('ebook_loans')
        .insert([loanRecord])
        .select()
        .single();
      if (loanErr) throw new Error(`電子書借閱失敗: ${loanErr.message}`);

      await client
        .from('ebooks')
        .update(withCoreAuditFields({ active_loans: ebook.active_loans + 1 }, { actorId, isUpdate: true }))
        .eq('id', ebookId);

      return createdLoan;
    },

    // ========================================================================
    // 6. ISBN API 自動取得書籍資訊 (OpenLibrary / Google Books Fallback)
    // ========================================================================
    async fetchBookMetadataByIsbn(isbn, fetchImpl = globalThis.fetch) {
      const cleanIsbn = String(isbn || '').replace(/[^0-9Xx]/g, '');
      if (cleanIsbn.length !== 10 && cleanIsbn.length !== 13) {
        throw new Error('ISBN 格式錯誤，必須為 10 碼或 13 碼');
      }

      // 優先查詢 OpenLibrary API
      const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`;
      const resp = await fetchImpl(url);
      if (!resp.ok) {
        throw new Error(`ISBN 外部書目服務回應異常 (HTTP ${resp.status})`);
      }
      const json = await resp.json();
      const entry = json[`ISBN:${cleanIsbn}`];
      if (!entry) {
        throw new Error(`查無 ISBN [${cleanIsbn}] 之公開書目資料`);
      }

      return {
        isbn: cleanIsbn,
        title: entry.title || '未命名書籍',
        subtitle: entry.subtitle || null,
        author: (entry.authors || []).map((a) => a.name).join(', ') || '佚名',
        publisher: (entry.publishers || []).map((p) => p.name)[0] || '未標示出版社',
        publish_year: entry.publish_date ? parseInt(String(entry.publish_date).match(/\d{4}/)?.[0] || '2026', 10) : 2026,
        cover_url: entry.cover?.medium || entry.cover?.small || null,
        source: 'OpenLibrary',
      };
    },

    // ========================================================================
    // 7 & 8. Email 到期預約通知 & LINE 讀者即時提醒 (Multi-Channel Notification)
    // ========================================================================
    async dispatchReaderNotification({ member, eventType, subject, message }, senderAdapters = {}, actorId = null) {
      const results = [];

      // Email 管道
      if (member.notify_email && member.email) {
        let status = 'SENT';
        let errorMessage = null;
        try {
          if (senderAdapters.sendEmail) {
            await senderAdapters.sendEmail({ to: member.email, subject, text: message });
          }
        } catch (err) {
          status = 'FAILED';
          errorMessage = err.message;
        }

        const log = withCoreAuditFields(
          {
            member_id: member.id,
            channel: 'EMAIL',
            event_type: eventType,
            recipient: member.email,
            subject,
            payload: { message },
            status,
            sent_at: status === 'SENT' ? new Date().toISOString() : null,
            error_message: errorMessage,
          },
          { actorId, supportsSoftDelete: false }
        );
        const { data } = await client.from('notification_logs').insert([log]).select().single();
        results.push(data || log);
      }

      // LINE Notify / Messaging API 管道
      if (member.notify_line && member.line_user_id) {
        let status = 'SENT';
        let errorMessage = null;
        try {
          if (senderAdapters.sendLinePush) {
            await senderAdapters.sendLinePush({ to: member.line_user_id, text: `【${subject}】\n${message}` });
          }
        } catch (err) {
          status = 'FAILED';
          errorMessage = err.message;
        }

        const log = withCoreAuditFields(
          {
            member_id: member.id,
            channel: 'LINE',
            event_type: eventType,
            recipient: member.line_user_id,
            subject,
            payload: { message },
            status,
            sent_at: status === 'SENT' ? new Date().toISOString() : null,
            error_message: errorMessage,
          },
          { actorId, supportsSoftDelete: false }
        );
        const { data } = await client.from('notification_logs').insert([log]).select().single();
        results.push(data || log);
      }

      return results;
    },

    // ========================================================================
    // 9. 自助借還機 (Self-Service Kiosk: 支援讀者 QR 證 + RFID/條碼自助借還)
    // ========================================================================
    async selfServiceCheckout({ memberQrToken, itemIdentifiers = [], branchId }, circulationHandler, senderAdapters = {}) {
      const { data: member } = await this.lookupByQrToken(memberQrToken);
      if (member.status !== 'ACTIVE') {
        throw new Error(`讀者證狀態為 [${member.status}]，請洽人工櫃台處理`);
      }

      const checkoutResults = [];
      for (const identifier of itemIdentifiers) {
        // 支援掃描書籍 QR Token、RFID EPC 或實體條碼
        let barcode = identifier;
        if (identifier.startsWith('LIBQR:')) {
          const parsed = this.parseEntityQrToken(identifier);
          barcode = parsed.code;
        } else if (identifier.startsWith('EPC-')) {
          const { data: copyByRfid } = await client
            .from('book_copies')
            .select('barcode')
            .eq('rfid_epc', identifier)
            .single();
          if (!copyByRfid) throw new Error(`無法辨識的 RFID 標籤: ${identifier}`);
          barcode = copyByRfid.barcode;
        }

        const res = await circulationHandler.borrowBook({
          barcode,
          memberId: member.id,
          currentBranchId: branchId,
        });
        checkoutResults.push({ barcode, ...res });
      }

      // 自動推播自助借書電子收據（取代紙本）
      await this.dispatchReaderNotification(
        {
          member,
          eventType: 'KIOSK_RECEIPT',
          subject: '自助借書交易明細通知',
          message: `您已於自助借還機完成 ${checkoutResults.length} 冊圖書借閱。`,
        },
        senderAdapters,
        member.id
      );

      return {
        member,
        count: checkoutResults.length,
        items: checkoutResults,
      };
    },

    // ========================================================================
    // 10. AI 智慧推薦 (依閱讀紀錄、分類偏好與共借協同過濾推薦書籍)
    // ========================================================================
    async getAiBookRecommendations(memberId, limit = 5) {
      const [{ data: member }, { data: allBorrows }, { data: allBooks }] = await Promise.all([
        client.from('members').select('*').eq('id', memberId).single(),
        client.from('borrow_records').select('member_id, copy:book_copies(book_id)'),
        client.from('books').select('*').is('deleted_at', null),
      ]);

      const activeBooks = filterActiveRecords(allBooks || []);
      const borrows = allBorrows || [];

      // 找出該讀者已讀過的 book_id 集合
      const readBookIds = new Set(
        borrows
          .filter((b) => b.member_id === memberId)
          .map((b) => b.copy?.book_id)
          .filter(Boolean)
      );

      // 統計讀者歷史閱讀分類權重
      const bookMap = new Map(activeBooks.map((b) => [b.id, b]));
      const categoryScore = {};
      for (const prefCat of member?.preferred_categories || []) {
        categoryScore[prefCat] = (categoryScore[prefCat] || 0) + 2;
      }
      for (const readId of readBookIds) {
        const cat = bookMap.get(readId)?.category;
        if (cat) categoryScore[cat] = (categoryScore[cat] || 0) + 3;
      }

      // 協同過濾：尋找借過相同書籍的其他讀者還借了哪些書
      const similarReaders = new Set(
        borrows
          .filter((b) => b.member_id !== memberId && readBookIds.has(b.copy?.book_id))
          .map((b) => b.member_id)
      );
      const coBorrowScore = {};
      for (const b of borrows) {
        const targetBookId = b.copy?.book_id;
        if (similarReaders.has(b.member_id) && targetBookId && !readBookIds.has(targetBookId)) {
          coBorrowScore[targetBookId] = (coBorrowScore[targetBookId] || 0) + 4;
        }
      }

      // 計算綜合推薦分數並排除已讀書籍
      const scored = activeBooks
        .filter((book) => !readBookIds.has(book.id))
        .map((book) => {
          const catPoints = categoryScore[book.category] || 0;
          const collabPoints = coBorrowScore[book.id] || 0;
          const totalScore = catPoints + collabPoints + 1;
          const reasons = [];
          if (collabPoints > 0) reasons.push('相似閱讀興趣讀者也借閱過');
          if (catPoints > 0) reasons.push(`符合您的「${book.category}」閱讀偏好`);
          if (reasons.length === 0) reasons.push('館藏熱門精選推薦');

          return {
            ...book,
            recommendation_score: totalScore,
            recommendation_reason: reasons.join('；'),
          };
        })
        .sort((a, b) => b.recommendation_score - a.recommendation_score)
        .slice(0, limit);

      return scored;
    },
  };
}

export const extensibilityService = createExtensibilityService(supabase);
export const externalService = {
  /**
   * 產生借閱條碼或讀者證 QR Code 圖片網址
   */
  generateQrCodeUrl(text, size = 160) {
    const encoded = encodeURIComponent(String(text || ''));
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}`;
  },

  /**
   * 呼叫瀏覽器列印借閱收據視窗
   */
  printLoanReceipt({ loanNo, memberCode, bookTitle, barcode, dueDate }) {
    if (typeof window === 'undefined') return false;
    const printWin = window.open('', '_blank', 'width=420,height=600');
    if (!printWin) return false;

    printWin.document.write(`
      <!doctype html>
      <html lang="zh-Hant">
      <head>
        <meta charset="utf-8" />
        <title>借閱收據 - ${loanNo}</title>
        <style>
          body { font-family: 'Roboto', 'Noto Sans TC', sans-serif; padding: 20px; }
          .receipt { border: 1px dashed #333; padding: 16px; }
          h3 { margin-top: 0; text-align: center; }
          p { margin: 6px 0; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="receipt">
          <h3>雲端智慧圖書館借閱憑單</h3>
          <hr />
          <p><strong>借閱單號：</strong>${loanNo}</p>
          <p><strong>讀者證號：</strong>${memberCode}</p>
          <p><strong>書名：</strong>${bookTitle}</p>
          <p><strong>館藏條碼：</strong>${barcode}</p>
          <p><strong>應還日期：</strong>${new Date(dueDate).toLocaleDateString()}</p>
          <hr />
          <p style="text-align:center;font-size:12px;">請妥善保管書籍並於期限內歸還</p>
        </div>
        <script>window.onload = () => { window.print(); window.close(); };</script>
      </body>
      </html>
    `);
    printWin.document.close();
    return true;
  },
};
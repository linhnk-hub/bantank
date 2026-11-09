# Thư mục Tài nguyên Nhạc nền Tĩnh (`public/audio/`) – Bắn Tank Online (M7.3.3)

Thư mục này chứa các file nhạc nền dùng chung (`.mp3`, `.ogg`, `.wav`, tối đa `25 MB`) được phân phối trực tiếp qua **GitHub Pages** tại đường dẫn tương đối `./audio/<tên-file>?v=<version>`.

## Quy định bảo mật & định dạng
1. **Định dạng hỗ trợ:** `.mp3` (`audio/mpeg`), `.ogg` (`audio/ogg`), `.wav` (`audio/wav`).
2. **Dung lượng tối đa:** `25 MB` (`26,214,400 bytes`).
3. **Quy tắc đặt tên file an toàn:** Chỉ sử dụng chữ cái không dấu, chữ số, dấu gạch dưới (`_`), dấu gạch ngang (`-`) và dấu chấm (`.`), khớp biểu thức chính quy:
   `^[A-Za-z0-9._-]+\.(mp3|ogg|wav)$`
   Ví dụ: `bgm_v1_bantank_theme.mp3`
4. **Đường dẫn tương đối sau khi build (`npm run build`):**
   - File tại `public/audio/<fileName>` sẽ được Vite đóng gói nguyên bản sang `dist/audio/<fileName>`.
   - Khi triển khai trên GitHub Pages (`https://bantank.online`), người chơi tải trực tiếp từ `./audio/<fileName>?v=<version>`.

# Database BravoForest

`BravoForest.sql` là bản schema đầy đủ dành cho MariaDB trong XAMPP. File tạo database `BravoForest`, 33 bảng InnoDB, 11 view báo cáo, các khóa ngoại, `CHECK`, index và dữ liệu khởi tạo tối thiểu.

## Dữ liệu khởi tạo

- Ba vai trò hệ thống: `CUSTOMER`, `ADMIN`, `TECHNICIAN`. Đây là dữ liệu tham chiếu bắt buộc của khóa ngoại `users.role_id`.
- Một tài khoản admin khởi tạo: `admin@bravoforest.local`. Không có mật khẩu mặc định được công bố.
- Không có dữ liệu mẫu về khách hàng, máy, địa điểm, vật liệu, quy tắc điểm, voucher hoặc giao dịch.

Sau khi import, dùng lệnh `admin:set-password` trong [apps/api/README.md](../apps/api/README.md) để đặt mật khẩu admin trước khi đăng nhập.

## Dữ liệu cấu hình tối thiểu

Sau khi import schema, có thể chạy `seed_reference_data.sql` để thêm danh mục vật liệu, loại vỏ, lý do từ chối, loại cảnh báo, nhóm voucher và quy tắc khởi tạo 10 điểm/vỏ. Script có thể chạy nhiều lần và **không** tạo khách hàng, máy, đối tác, voucher hoặc giao dịch mẫu. Quản trị viên vẫn tạo dữ liệu vận hành thật trên trang admin.

## Import bằng phpMyAdmin

1. Bật MySQL trong XAMPP.
2. Mở `http://localhost/phpmyadmin`.
3. Chọn **Import**, chọn `BravoForest.sql`, rồi bấm **Go**.

## Import bằng PowerShell

```powershell
Get-Content -Raw -Encoding utf8 .\database\BravoForest.sql |
  D:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4
```

Schema không tự xóa database hiện có. Nếu cần tạo lại toàn bộ dữ liệu trong môi trường phát triển, chủ động bỏ comment câu `DROP DATABASE` ở đầu file sau khi đã sao lưu.

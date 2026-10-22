# Database BravoForest

`BravoForest.sql` là bản schema đầy đủ dành cho MariaDB trong XAMPP. File tạo database `BravoForest`, 35 bảng InnoDB, 11 view báo cáo, các khóa ngoại, `CHECK`, index và dữ liệu khởi tạo tối thiểu.

## Dữ liệu khởi tạo

- Ba vai trò hệ thống: `CUSTOMER`, `ADMIN`, `TECHNICIAN`. Đây là dữ liệu tham chiếu bắt buộc của khóa ngoại `users.role_id`.
- SQL seed không tạo tài khoản admin. Tạo admin đầu tiên bằng lệnh `admin:set-password` trong [apps/api/README.md](../apps/api/README.md), sau khi import schema.
- Không có dữ liệu mẫu về khách hàng, máy, địa điểm, vật liệu, quy tắc điểm, voucher hoặc giao dịch.

Sau khi import, dùng lệnh `admin:set-password` trong [apps/api/README.md](../apps/api/README.md) để đặt mật khẩu admin trước khi đăng nhập.

## Dữ liệu cấu hình tối thiểu

Sau khi import schema, có thể chạy `seed_reference_data.sql` để thêm danh mục vật liệu, loại vỏ, lý do từ chối, loại cảnh báo, nhóm voucher và quy tắc khởi tạo 10 điểm/vỏ. Script có thể chạy nhiều lần và **không** tạo khách hàng, máy, đối tác, voucher hoặc giao dịch mẫu. Quản trị viên vẫn tạo dữ liệu vận hành thật trên trang admin.

## Cập nhật database đang có

Với database đã chạy từ trước, áp dụng các file trong `database/migrations` theo thứ tự ngày và chỉ chạy mỗi migration một lần. Migration `20261021_session_idle_watchdog_and_sensor_rejections.sql` cần chạy sau `20261021_harden_rvm_session_finalization.sql`; migration này bổ sung timeout hoạt động 5 phút và lý do từ chối do cảm biến. Migration `20261019_add_cashout_feature.sql` thêm chức năng đổi điểm thành tiền; tính năng bắt đầu ở trạng thái tắt và chỉ mở sau khi admin cấu hình chính sách.

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

# Máy tính quản lý

Nhóm quản lý gồm:

- API tại cổng `4000`;
- worker xử lý nền;
- trang khách hàng tại cổng `3000`;
- trang quản trị tại cổng `3001`.

Giao diện RVM cổng `3002` không được khởi động bởi nhóm này.

## Chạy trên Windows

1. Cài Node.js 20 trở lên, Docker Desktop và XAMPP/MariaDB.
2. Tạo `apps/api/.env` từ `apps/api/.env.example`, sau đó điền cấu hình database, Redis, JWT và SMTP.
3. Khởi động MySQL/MariaDB trong XAMPP.
4. Mở PowerShell tại thư mục repository và chạy:

```powershell
.\deploy\management\start.ps1
```

Script tự khởi động MariaDB của XAMPP khi cần, khởi động Redis và chỉ mở các giao diện sau khi API, MariaDB và Redis đều sẵn sàng. Lần chạy đầu có thể hiện hộp thoại Administrator để mở riêng cổng API `4000` cho mạng LAN hiện tại. Những lần sau chỉ cần dùng một lệnh tại thư mục dự án:

```powershell
npm run dev
```

Lệnh này chạy API, worker, customer, admin và kiosk local. Pi tiếp tục chạy kiosk bằng Docker riêng và kết nối đến API qua mạng LAN.

## Kết nối Raspberry Pi

Pi phải truy cập được `http://IP_MAY_QUAN_LY:4000/api/v1`. Nếu Windows Firewall chặn cổng `4000`, cho phép kết nối TCP cổng này trong mạng riêng (Private network). Không sử dụng `localhost` trong cấu hình Pi vì `localhost` trên Pi là chính Raspberry Pi.

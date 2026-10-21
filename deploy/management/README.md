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

Script sẽ khởi động Redis và bốn dịch vụ quản lý. Có thể chạy trực tiếp `npm run dev:management` nếu Redis đã hoạt động.

## Kết nối Raspberry Pi

Pi phải truy cập được `http://IP_MAY_QUAN_LY:4000/api/v1`. Nếu Windows Firewall chặn cổng `4000`, cho phép kết nối TCP cổng này trong mạng riêng (Private network). Không sử dụng `localhost` trong cấu hình Pi vì `localhost` trên Pi là chính Raspberry Pi.

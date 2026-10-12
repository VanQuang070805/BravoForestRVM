# BravoForest

Hệ thống Reverse Vending Machine gồm website khách hàng, màn hình kiosk mô phỏng, trang quản trị, NestJS API, BullMQ worker và database MariaDB chuẩn 3NF.

## Ứng dụng

| Thành phần | URL local | Công nghệ |
| --- | --- | --- |
| Customer web | http://localhost:3000 | Next.js 16, React 19, TypeScript, Tailwind |
| Admin web | http://localhost:3001 | Next.js 16, React 19, TypeScript, Tailwind |
| RVM kiosk | http://localhost:3002 | Next.js 16, React 19, TypeScript, Tailwind |
| REST API | http://localhost:4000/api/v1 | NestJS, TypeORM, MariaDB |
| Swagger | http://localhost:4000/api/docs | OpenAPI |
| Redis | localhost:6379 | Redis 7.4, BullMQ |

## Chạy local với XAMPP

Yêu cầu: Node.js 20+, npm 10+, XAMPP MariaDB 10.4+ và Docker Desktop cho Redis. Dành khoảng 2–3 GB cho source, dependency, build cache và image Redis.

1. Bật MySQL trong XAMPP.
2. Import `database/BravoForest.sql` bằng phpMyAdmin nếu database chưa được khởi tạo.
3. Sao chép các file `.env.example` thành `.env` hoặc `.env.local` tương ứng.
4. Sao chép `apps/api/.env.example` thành `apps/api/.env`, thay các secret mẫu, sau đó chạy:

```powershell
npm install
docker compose -f infrastructure/docker-compose.yml up -d redis
npm run dev
```

Local dùng MariaDB từ XAMPP; Docker Compose ở trên chỉ khởi chạy Redis của BravoForest. API và BullMQ worker chạy bằng Node.js trên máy phát triển và cùng kết nối tới XAMPP MariaDB/Redis. Container có prefix `bravoforest-local`, network và volume riêng; không tham gia Compose project `royal-dify`.

API yêu cầu XAMPP đã import schema `BravoForest.sql` và chạy seed tham chiếu `seed_reference_data.sql`. Các tích hợp đối tác dùng adapter contract: `POST /accounts/verify` để xác minh tài khoản và `POST /redemptions` để cấp voucher; production cần `PARTNER_API_ALLOWED_HOSTS` cùng credential riêng cho từng đối tác.

Sau khi import, đặt mật khẩu admin bằng hướng dẫn trong [apps/api/README.md](apps/api/README.md). SQL seed không phát hành mật khẩu mặc định.

## Google Maps

- Điền `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` trong `apps/customer-web/.env.local` để hiển thị Google Maps và marker máy.
- Điền `GOOGLE_MAPS_SERVER_API_KEY` trong `apps/api/.env` để API tự geocode địa chỉ khi admin tạo địa điểm mà chưa nhập tọa độ.
- Giới hạn browser key theo HTTP referrer và server key theo IP/API tại Google Cloud Console.
- Khi chưa có key, giao diện hiển thị danh sách địa điểm thay cho bản đồ Google.

## Kiểm tra

```powershell
npm run typecheck
npm run build
npm run lint -w @bravoforest/api
npm run test -w @bravoforest/api
npm run test:e2e -w @bravoforest/api
```

## Docker production

`infrastructure/docker-compose.prod.yml` tách MariaDB, Redis, API, worker, customer web, admin web, kiosk và Nginx thành các service riêng. Trỏ ba tên miền trong `infrastructure/.env.prod` về máy chủ, cấp chứng chỉ TLS có đủ ba tên miền trong SAN và đặt `fullchain.pem` cùng `privkey.pem` vào `infrastructure/certs/`. Nginx chỉ phục vụ HTTPS cho các host đã cấu hình. Dùng `docker compose --env-file infrastructure/.env.prod -f infrastructure/docker-compose.prod.yml up -d --build`; import `database/BravoForest.sql` vào MariaDB production trước khi mở API ra Internet.

Chi tiết luồng và ranh giới dữ liệu nằm trong `docs/architecture.md`.

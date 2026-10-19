# Báo cáo rà soát bảo mật BravoForest

**Phạm vi:** rà soát mã nguồn, cấu hình Compose, schema và luồng API trong repository; sau đó sửa các điểm có thể xử lý tại đây. Đây không phải kiểm thử xâm nhập và không xác minh được cấu hình DNS, TLS, secret manager, ổ đĩa, backup hay Google Cloud đang chạy thật.

## Tóm tắt

Đã xử lý các rủi ro có thể khắc phục trực tiếp: bỏ thông tin đăng nhập admin mặc định khỏi SQL seed, khóa tài khoản cũ nếu vẫn còn hash mặc định, vô hiệu hóa mọi phiên khi đổi/đặt lại mật khẩu, giới hạn quyền DB runtime, tách secret khỏi API/worker, chuyển access token web khỏi localStorage, tiêu thụ OTP nguyên tử, bổ sung security headers và tắt Swagger ở production.

MariaDB image mặc định cấp `GRANT ALL` cho user tạo qua `MARIADB_USER` trên database chỉ định; init script mới thu hẹp quyền runtime còn DML theo [tài liệu MariaDB](https://mariadb.com/docs/server/server-management/automated-mariadb-deployment-and-administration/docker-and-mariadb/mariadb-server-docker-official-image-environment-variables).

Chưa thể xác nhận deploy an toàn cho đến khi vận hành bật mã hóa ổ đĩa và backup, cấp secret riêng, áp dụng các migration/grant cần thiết, giới hạn Google Maps key, cấu hình chứng chỉ TLS thật và kiểm tra phục hồi backup. Bcrypt chỉ phù hợp với mật khẩu; không bcrypt tên, email hay số điện thoại vì ứng dụng cần đọc và tìm kiếm các trường này.

## Đối chiếu các hạng mục

| # | Hạng mục | Trạng thái sau rà soát | Việc còn lại |
|---|---|---|---|
| 1 | Ẩn API key | Secret của server nằm trong env riêng cho API/worker; root DB password không còn được truyền vào hai service này. Google Maps key dùng trên trình duyệt vốn công khai. | Giới hạn browser key theo referrer và API được phép trong Google Cloud; giữ geocoding key ở server. Không đưa file env thật vào Git. |
| 2 | Database và hash thông tin khách hàng | Mật khẩu được bcrypt. Bcrypt không thể dùng cho tên/email/điện thoại vì mất khả năng hiển thị, tìm kiếm và đối chiếu. DB volume production không tự mã hóa dữ liệu. | Bật mã hóa host/block storage và mã hóa backup độc lập; để khóa ngoài máy DB/repository. |
| 3 | Row level security | MariaDB trong dự án không có chính sách RLS kiểu PostgreSQL. API kiểm tra JWT/role và truy vấn dữ liệu khách theo user ID. | Duy trì ownership check ở mọi endpoint mới; không thể bật RLS PostgreSQL trên MariaDB hiện tại. |
| 4 | Mã hóa dữ liệu | Secret đối tác được mã hóa AES-256-GCM bằng khóa env riêng; API dùng TLS ở lớp triển khai. PII trong bảng khách hàng vẫn có thể đọc trực tiếp từ DB. | Mã hóa ổ đĩa và backup là điều kiện trước khi public launch. Nếu cần mã hóa từng trường, phải thiết kế thêm blind index cho các trường cần tìm kiếm. |
| 5 | Xác thực server | Guard JWT toàn cục, kiểm tra trạng thái user/credential version, guard role; máy RVM có guard khóa API riêng. | Cấp JWT access/refresh secret riêng, ngẫu nhiên và lưu bằng secret manager. |
| 6 | Kiểm tra input | Nest `ValidationPipe` bật `whitelist`, `forbidNonWhitelisted`, `transform`; các route dùng DTO và pipe cho ID số. | Tiếp tục dùng DTO cho endpoint mới; không chuyển dữ liệu chưa validate trực tiếp vào query. |
| 7 | Khóa quyền truy cập record | Các truy vấn ví, lịch sử, thông báo, phiên gửi và đổi quà ràng buộc theo user ID lấy từ JWT; thao tác admin yêu cầu role. | MariaDB không thay thế được quyền ở từng dòng; cần rà soát mỗi endpoint mới theo cùng quy tắc. |
| 8 | Chặn sửa field ngoài ý muốn | DTO từ chối thuộc tính lạ; cập nhật hồ sơ và thao tác ghi chọn rõ trường được phép. | Không truyền nguyên object request vào entity hoặc câu UPDATE động. |
| 9 | Cookie và refresh token | Refresh token dùng cookie HttpOnly, SameSite=Strict, Secure khi production; Redis lưu digest và xoay token. Access token customer/admin giữ trong memory. Đổi/reset mật khẩu tăng `credential_version` để thu hồi phiên cũ. | Web Locks đồng bộ refresh giữa tab ở browser hỗ trợ API này; browser cũ có thể gặp refresh cạnh tranh. |
| 10 | Giới hạn đăng nhập | Redis throttling mặc định 120 request/phút; các route login/register/verify/reset giới hạn 5/phút, refresh 20/phút; OTP hết hạn sau 10 phút, cooldown gửi 60 giây, tối đa năm lần thử và được kiểm tra/tiêu thụ nguyên tử. | Chưa có CAPTCHA/WAF; bật challenge hoặc managed WAF nếu mức lạm dụng thực tế yêu cầu. |
| 11 | SQL injection | Các giá trị truy vấn được bind; các identifier cập nhật động được chọn từ danh sách cố định trong code. | Không nối chuỗi input người dùng vào SQL/identifier. Báo cáo này không chạy payload kiểm thử trên hệ thống đang hoạt động. |
| 12 | Chặn bot | Có rate limit và giới hạn OTP; chưa có challenge bot. | WAF/CAPTCHA là lựa chọn triển khai theo lưu lượng và mức abuse; không thể xác minh từ repository. |
| 13 | Tham số hóa query | Truy vấn API dùng placeholder/bind parameter. | Tiếp tục áp dụng quy tắc này cho truy vấn mới. |
| 14 | Escape nội dung | React mặc định escape text; không thấy dùng `dangerouslySetInnerHTML` trong `apps/` và `packages/`. | Không render HTML thô lấy từ khách hàng/đối tác. |
| 15 | Giảm dữ liệu trả về từ AI | Không tìm thấy tích hợp AI hoặc gửi dữ liệu tới AI trong các ứng dụng hiện tại. | Nếu thêm AI sau này, chỉ gửi trường tối thiểu và loại bỏ thông tin nhận dạng không cần thiết. |
| 16 | Security headers | API bật Helmet; Nginx thêm HSTS, `nosniff`, Referrer-Policy, chống framing và CSP `frame-ancestors`. Swagger chỉ bật ngoài production. | CSP hiện giới hạn framing, chưa phải policy đầy đủ cho script/resource; cần thử nghiệm trước khi siết CSP rộng hơn. |
| 17 | HTTPS | Nginx chuyển HTTP sang HTTPS, dùng TLS 1.2/1.3 và HSTS trong cấu hình production. | Cần DNS đúng, chứng chỉ hợp lệ/được gia hạn và firewall production; repository không thể xác nhận các trạng thái này. |

## Tài khoản admin seed

SQL seed mới chỉ tạo role, không tạo admin với thông tin đăng nhập công khai. `npm run admin:set-password -w @bravoforest/api` tạo admin đầu tiên hoặc đặt mật khẩu mới cho admin chưa bị xóa; mật khẩu tối thiểu 12 ký tự, được bcrypt và không in ra terminal. Email `.local` chỉ được dùng trong môi trường không production.

Với DB cũ, áp dụng `20261018_add_user_credential_version.sql`, migration này cũng tăng phiên bản thông tin đăng nhập của mọi user để thu hồi token cũ, rồi áp dụng `20261018_lock_legacy_admin_seed.sql`. Migration thứ hai chỉ khóa tài khoản seed nếu hash vẫn đúng với hash mặc định; tài khoản đã đổi mật khẩu không bị ảnh hưởng. Chạy lệnh bootstrap để đặt mật khẩu mới và kích hoạt lại trước khi đăng nhập.

## Thao tác trước khi deploy

1. Sao chép và điền `.env.prod`, `.env.api.prod`, `.env.worker.prod`, `.env.partners.prod`; dùng secret riêng, giá trị thật mạnh và không commit các file này.
2. Với DB cũ, đóng Nginx/API/worker trước. Với DB mới, import `database/BravoForest.sql` bằng DBA. Với DB cũ, áp dụng migration credential version rồi migration khóa admin seed.
3. Chạy grant script MariaDB: `docker compose ... exec -T mariadb sh /docker-entrypoint-initdb.d/10-runtime-grants.sh`; script cũng tự chạy ở lần khởi tạo volume mới. API/worker chỉ cần SELECT/INSERT/UPDATE/DELETE.
4. Khởi động riêng API, bootstrap admin bằng mật khẩu mới, rồi mới khởi động worker, web, kiosk và Nginx. Hướng dẫn lệnh đầy đủ theo thứ tự nằm trong `docs/security-deployment.md`.
5. Bật mã hóa ổ đĩa/backup, giới hạn browser Maps key, cài TLS certificate cho cả ba domain, bật cảnh báo đăng nhập/OTP thất bại và xác minh quy trình restore.
6. MFA cho admin chưa được triển khai; bổ sung trước khi mở dashboard ra Internet nếu cần lớp bảo vệ mạnh hơn trước việc lộ mật khẩu hoặc chiếm phiên.

## Kiểm tra mã sau sửa

TypeScript check đã chạy thành công cho API, customer web và admin web. `git diff --check` không báo lỗi khoảng trắng. Không chạy kiểm thử chức năng hay penetration test trong lượt này.

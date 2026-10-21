# Arduino controller

Nạp file `bravoforest_rvm/bravoforest_rvm.ino` vào Arduino, sau đó nối Arduino với Raspberry Pi bằng USB. Pi giao tiếp với Arduino ở baud `115200`.

## Chân đang dùng

| Thiết bị | Chân Arduino |
| --- | --- |
| L298N IN1 | D8 |
| L298N IN2 | D9 |
| SRF05 TRIG | D3 |
| SRF05 ECHO | D4 |
| LJ12A3 tín hiệu kim loại | D5 |
| MG996R tín hiệu servo | D6 |

## Nguồn điện an toàn

- Không cấp nguồn MG996R từ chân 5 V của Arduino. Dùng nguồn 5–6 V riêng đủ dòng và nối chung GND với Arduino.
- Motor dùng nguồn riêng qua L298N; nối chung GND giữa nguồn motor, Arduino và nguồn servo.
- Sketch giả định jumper `ENA` trên L298N đang được gắn. Nếu chiều motor ngược với thực tế, đảo hai dây motor hoặc đổi mức HIGH/LOW trong `motorForward()` và `motorReverse()`.
- LJ12A3 thường dùng điện áp cao hơn mức logic Arduino. Không nối ngõ ra 6–36 V trực tiếp vào D5; dùng module cảm biến có ngõ ra 5 V, optocoupler hoặc mạch chia áp phù hợp.
- Raspberry Pi chỉ nối với Arduino qua USB; không nối trực tiếp các chân 5 V của Arduino vào GPIO 3,3 V của Pi.

## Giao thức Serial

Pi gửi: `ACCEPT PET`, `ACCEPT CAN`, `REJECT`, `CLEAR`, `STOP`, `PING`, `STATUS`.

Arduino trả về các sự kiện như `READY`, `EVENT AT_GATE PET`, `RESULT PET 1`, `RESULT CAN 0`, `COUNT PET 1 CAN 0` hoặc `ERROR ...`.

Servo mặc định ở giữa `90°`, PET đi bên trái tại `180°`, lon đi bên phải tại `0°`. Nếu cơ khí lắp ngược, đổi ba hằng số `SERVO_*_ANGLE` ở đầu sketch; không đổi logic controller Pi.

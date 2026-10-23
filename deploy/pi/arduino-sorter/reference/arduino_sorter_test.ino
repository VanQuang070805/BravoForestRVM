/*
  Test AI + Arduino cho may phan loai.
  Nhan lenh tu Python:
    MOTOR:FORWARD | MOTOR:REVERSE | MOTOR:STOP
    SERVO:LEFT | SERVO:RIGHT
  Gui trang thai cam bien:
    ULTRASONIC:0/1, PROXIMITY:0/1
*/

#include <Servo.h>

const byte MOTOR_IN1 = 8;
const byte MOTOR_IN2 = 9;
const byte SERVO_PIN = 6;
const byte PROXIMITY_PIN = 5;  // OUT cua cam bien kim loai
const byte TRIG_PIN = 3;       // SRF05 TRIG
const byte ECHO_PIN = 4;       // SRF05 ECHO

const float STOP_DISTANCE_CM = 10; // <= gia tri nay la co vat o cam bien sieu am

// Sua lai neu huong lap dat servo cua ban nguoc.
const int SERVO_CENTER = 90;
const int SERVO_LEFT = 180;
const int SERVO_RIGHT = 0;
const unsigned long SERVO_HOLD_MS = 800;
const unsigned long ULTRASONIC_DEBOUNCE_MS = 150;
const unsigned long PROXIMITY_DEBOUNCE_MS = 300;

// Nhieu module tiem can tra LOW khi phat hien kim loai.
const bool PROXIMITY_ACTIVE_LEVEL = LOW;

Servo gateServo;
bool lastUltrasonic = false;
bool lastProximity = false;
bool rawUltrasonic = false;
bool rawProximity = false;
unsigned long rawUltrasonicChangedMs = 0;
unsigned long rawProximityChangedMs = 0;
unsigned long lastSensorReadMs = 0;
String activeServoDirection = "";

enum ServoPhase { SERVO_IDLE, SERVO_HOLDING, SERVO_RETURNING };
ServoPhase servoPhase = SERVO_IDLE;
unsigned long servoPhaseStartedMs = 0;

float readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  if (duration == 0) return 999.0; // Khong co echo: xem nhu khong co vat
  return duration * 0.0343 / 2.0;
}

void motorStop() {
  digitalWrite(MOTOR_IN1, LOW);
  digitalWrite(MOTOR_IN2, LOW);
}

void motorForward() {
  digitalWrite(MOTOR_IN1, HIGH);
  digitalWrite(MOTOR_IN2, LOW);
}

void motorReverse() {
  digitalWrite(MOTOR_IN1, LOW);
  digitalWrite(MOTOR_IN2, HIGH);
}

void startServoMove(int targetAngle, const char* direction) {
  if (servoPhase != SERVO_IDLE) return;
  gateServo.write(targetAngle);
  activeServoDirection = direction;
  servoPhase = SERVO_HOLDING;
  servoPhaseStartedMs = millis();
  Serial.print("SERVO:START:");
  Serial.println(direction);
}

void updateServo() {
  unsigned long elapsed = millis() - servoPhaseStartedMs;
  if (servoPhase == SERVO_HOLDING && elapsed >= SERVO_HOLD_MS) {
    gateServo.write(SERVO_CENTER);
    servoPhase = SERVO_RETURNING;
    servoPhaseStartedMs = millis();
  } else if (servoPhase == SERVO_RETURNING && elapsed >= 400) {
    servoPhase = SERVO_IDLE;
    Serial.print("SERVO:DONE:");
    Serial.println(activeServoDirection);
    activeServoDirection = "";
  }
}

void processCommand(String command) {
  command.trim();
  if (command == "MOTOR:FORWARD") motorForward();
  else if (command == "MOTOR:REVERSE") motorReverse();
  else if (command == "MOTOR:STOP") motorStop();
  else if (command == "SERVO:LEFT") startServoMove(SERVO_LEFT, "LEFT");
  else if (command == "SERVO:RIGHT") startServoMove(SERVO_RIGHT, "RIGHT");
  else {
    Serial.print("UNKNOWN:");
    Serial.println(command);
  }
}

void readSerialCommands() {
  static String command = "";
  while (Serial.available()) {
    char incoming = (char)Serial.read();
    if (incoming == '\n' || incoming == '\r') {
      if (command.length() > 0) {
        processCommand(command);
        command = "";
      }
    } else if (command.length() < 40) {
      command += incoming;
    }
  }
}

void reportSensors() {
  if (millis() - lastSensorReadMs < 100) return;
  lastSensorReadMs = millis();

  bool sampledUltrasonic = readDistanceCm() <= STOP_DISTANCE_CM;
  bool sampledProximity = digitalRead(PROXIMITY_PIN) == PROXIMITY_ACTIVE_LEVEL;

  if (sampledUltrasonic != rawUltrasonic) {
    rawUltrasonic = sampledUltrasonic;
    rawUltrasonicChangedMs = millis();
  }
  if (sampledProximity != rawProximity) {
    rawProximity = sampledProximity;
    rawProximityChangedMs = millis();
  }

  bool ultrasonicHasObject = lastUltrasonic;
  bool proximityHasCan = lastProximity;
  if (rawUltrasonic != lastUltrasonic && millis() - rawUltrasonicChangedMs >= ULTRASONIC_DEBOUNCE_MS) {
    ultrasonicHasObject = rawUltrasonic;
  }
  if (rawProximity != lastProximity && millis() - rawProximityChangedMs >= PROXIMITY_DEBOUNCE_MS) {
    proximityHasCan = rawProximity;
  }

  if (ultrasonicHasObject != lastUltrasonic) {
    lastUltrasonic = ultrasonicHasObject;
    Serial.print("ULTRASONIC:");
    Serial.println(ultrasonicHasObject ? 1 : 0);
  }
  if (proximityHasCan != lastProximity) {
    lastProximity = proximityHasCan;
    Serial.print("PROXIMITY:");
    Serial.println(proximityHasCan ? 1 : 0);
  }
}

void setup() {
  pinMode(MOTOR_IN1, OUTPUT);
  pinMode(MOTOR_IN2, OUTPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(PROXIMITY_PIN, INPUT_PULLUP);

  motorStop();
  gateServo.attach(SERVO_PIN);
  gateServo.write(SERVO_CENTER);
  Serial.begin(115200);

  // Gui trang thai ban dau de Python khong phai cho den khi cam bien doi.
  rawUltrasonic = readDistanceCm() <= STOP_DISTANCE_CM;
  rawProximity = digitalRead(PROXIMITY_PIN) == PROXIMITY_ACTIVE_LEVEL;
  lastUltrasonic = rawUltrasonic;
  lastProximity = rawProximity;
  Serial.print("ULTRASONIC:"); Serial.println(lastUltrasonic ? 1 : 0);
  Serial.print("PROXIMITY:"); Serial.println(lastProximity ? 1 : 0);
  Serial.println("READY");
}

void loop() {
  readSerialCommands();
  reportSensors();
  updateServo();
}

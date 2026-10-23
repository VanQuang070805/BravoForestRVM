#include <Servo.h>

// L298N
const uint8_t MOTOR_IN1_PIN = 8;
const uint8_t MOTOR_IN2_PIN = 9;

// SRF05
const uint8_t ULTRASONIC_TRIG_PIN = 3;
const uint8_t ULTRASONIC_ECHO_PIN = 4;

// LJ12A3/proximity sensor. Use an optocoupler or level shifter if the sensor is powered above 5 V.
const uint8_t METAL_SENSOR_PIN = 5;
const uint8_t METAL_ACTIVE_LEVEL = LOW;

// MG996R. Power the servo from a separate 5-6 V supply and connect all grounds together.
const uint8_t SERVO_PIN = 6;
const uint8_t SERVO_CENTER_ANGLE = 90;
const uint8_t SERVO_PET_LEFT_ANGLE = 180;
const uint8_t SERVO_CAN_RIGHT_ANGLE = 0;

const float GATE_DISTANCE_CM = 10.0F;
const unsigned long SENSOR_INTERVAL_MS = 80;
const unsigned long TELEMETRY_INTERVAL_MS = 500;
const unsigned long MOTOR_TIMEOUT_MS = 10000;
const unsigned long SENSOR_CONFIRM_MS = 1000;
const unsigned long METAL_SAMPLE_INTERVAL_MS = 20;
const unsigned long SERVO_HOLD_MS = 900;
const unsigned long SERVO_RETURN_MS = 650;
const uint8_t GATE_REQUIRED_READINGS = 3;
const uint8_t METAL_REQUIRED_HITS = 3;

enum MachineState {
  STATE_IDLE,
  STATE_FEEDING,
  STATE_CHECKING_METAL,
  STATE_SERVO_OUT,
  STATE_SERVO_RETURN,
  STATE_REJECTING,
  STATE_WAIT_CLEAR
};

enum ObjectType {
  OBJECT_NONE,
  OBJECT_PET,
  OBJECT_CAN
};

Servo sorterServo;
MachineState machineState = STATE_IDLE;
ObjectType currentObject = OBJECT_NONE;

unsigned long stateStartedAt = 0;
unsigned long lastSensorAt = 0;
unsigned long lastTelemetryAt = 0;
unsigned long lastMetalSampleAt = 0;
uint8_t gateHits = 0;
uint8_t metalHits = 0;
bool pendingAccepted = false;
unsigned long acceptedPetCount = 0;
unsigned long acceptedCanCount = 0;

String serialBuffer;

const char *stateName(MachineState state) {
  switch (state) {
    case STATE_IDLE: return "IDLE";
    case STATE_FEEDING: return "FEEDING";
    case STATE_CHECKING_METAL: return "CHECKING_METAL";
    case STATE_SERVO_OUT: return "SERVO_OUT";
    case STATE_SERVO_RETURN: return "SERVO_RETURN";
    case STATE_REJECTING: return "REJECTING";
    case STATE_WAIT_CLEAR: return "WAIT_CLEAR";
  }
  return "UNKNOWN";
}

const char *objectName(ObjectType objectType) {
  switch (objectType) {
    case OBJECT_PET: return "PET";
    case OBJECT_CAN: return "CAN";
    default: return "NONE";
  }
}

void motorForward() {
  digitalWrite(MOTOR_IN1_PIN, HIGH);
  digitalWrite(MOTOR_IN2_PIN, LOW);
}

void motorReverse() {
  digitalWrite(MOTOR_IN1_PIN, LOW);
  digitalWrite(MOTOR_IN2_PIN, HIGH);
}

void motorStop() {
  digitalWrite(MOTOR_IN1_PIN, LOW);
  digitalWrite(MOTOR_IN2_PIN, LOW);
}

float readDistanceCm() {
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(ULTRASONIC_TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);

  const unsigned long duration = pulseIn(ULTRASONIC_ECHO_PIN, HIGH, 25000UL);
  if (duration == 0) return -1.0F;
  return duration * 0.0343F / 2.0F;
}

void printState() {
  Serial.print("STATE ");
  Serial.print(stateName(machineState));
  Serial.print(" OBJECT ");
  Serial.println(objectName(currentObject));
}

void printCounts() {
  Serial.print("COUNT PET ");
  Serial.print(acceptedPetCount);
  Serial.print(" CAN ");
  Serial.println(acceptedCanCount);
}

void enterIdle() {
  motorStop();
  sorterServo.write(SERVO_CENTER_ANGLE);
  machineState = STATE_IDLE;
  currentObject = OBJECT_NONE;
  stateStartedAt = millis();
  gateHits = 0;
  metalHits = 0;
  pendingAccepted = false;
  Serial.println("READY");
}

void startAcceptedFeed(ObjectType objectType) {
  currentObject = objectType;
  machineState = STATE_FEEDING;
  stateStartedAt = millis();
  gateHits = 0;
  motorForward();
  Serial.print("ACK ACCEPT ");
  Serial.println(objectName(objectType));
}

void startReject() {
  currentObject = OBJECT_NONE;
  machineState = STATE_REJECTING;
  stateStartedAt = millis();
  motorReverse();
  Serial.println("ACK REJECT");
}

void startServoSort(bool accepted) {
  motorStop();
  pendingAccepted = accepted;
  sorterServo.write(currentObject == OBJECT_PET ? SERVO_PET_LEFT_ANGLE : SERVO_CAN_RIGHT_ANGLE);
  machineState = STATE_SERVO_OUT;
  stateStartedAt = millis();
  Serial.print("EVENT SORTING ");
  Serial.println(objectName(currentObject));
}

void finishSort() {
  if (pendingAccepted) {
    if (currentObject == OBJECT_PET) acceptedPetCount++;
    if (currentObject == OBJECT_CAN) acceptedCanCount++;
  }

  Serial.print("RESULT ");
  Serial.print(objectName(currentObject));
  Serial.print(" ");
  Serial.println(pendingAccepted ? "1" : "0");
  printCounts();

  machineState = STATE_WAIT_CLEAR;
  stateStartedAt = millis();
  motorStop();
}

void handleCommand(String command) {
  command.trim();
  command.toUpperCase();
  if (command.length() == 0) return;

  if (command == "PING") {
    Serial.println("PONG");
    return;
  }

  if (command == "STATUS") {
    printState();
    printCounts();
    return;
  }

  if (command == "STOP") {
    enterIdle();
    Serial.println("ACK STOP");
    return;
  }

  if (command == "CLEAR") {
    if (machineState == STATE_REJECTING || machineState == STATE_WAIT_CLEAR) {
      enterIdle();
      Serial.println("ACK CLEAR");
    } else {
      Serial.print("ERROR CLEAR_NOT_ALLOWED ");
      Serial.println(stateName(machineState));
    }
    return;
  }

  if (machineState != STATE_IDLE) {
    Serial.print("ERROR BUSY ");
    Serial.println(stateName(machineState));
    return;
  }

  if (command == "ACCEPT PET") {
    startAcceptedFeed(OBJECT_PET);
  } else if (command == "ACCEPT CAN") {
    startAcceptedFeed(OBJECT_CAN);
  } else if (command == "REJECT") {
    startReject();
  } else {
    Serial.print("ERROR UNKNOWN_COMMAND ");
    Serial.println(command);
  }
}

void readSerialCommands() {
  while (Serial.available() > 0) {
    const char incoming = static_cast<char>(Serial.read());
    if (incoming == '\n') {
      handleCommand(serialBuffer);
      serialBuffer = "";
    } else if (incoming != '\r') {
      if (serialBuffer.length() < 64) serialBuffer += incoming;
      else serialBuffer = "";
    }
  }
}

void updateFeeding(unsigned long now) {
  if (now - stateStartedAt >= MOTOR_TIMEOUT_MS) {
    motorStop();
    machineState = STATE_WAIT_CLEAR;
    Serial.println("ERROR FEED_TIMEOUT");
    return;
  }

  if (now - lastSensorAt < SENSOR_INTERVAL_MS) return;
  lastSensorAt = now;
  const float distance = readDistanceCm();

  if (distance > 0.0F && distance <= GATE_DISTANCE_CM) gateHits++;
  else gateHits = 0;

  if (now - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryAt = now;
    Serial.print("TELEMETRY DISTANCE_CM ");
    Serial.println(distance, 1);
  }

  if (gateHits < GATE_REQUIRED_READINGS) return;

  motorStop();
  Serial.print("EVENT AT_GATE ");
  Serial.println(objectName(currentObject));
  // AI chỉ cho phép vật đi vào. Cặp cảm biến vật lý quyết định PET/CAN
  // trong cửa sổ xác nhận một giây trước khi servo hoạt động.
  machineState = STATE_CHECKING_METAL;
  stateStartedAt = now;
  lastMetalSampleAt = now;
  metalHits = digitalRead(METAL_SENSOR_PIN) == METAL_ACTIVE_LEVEL ? 1 : 0;
}

void updateMetalCheck(unsigned long now) {
  const unsigned long elapsed = now - stateStartedAt;
  if (now - lastMetalSampleAt >= METAL_SAMPLE_INTERVAL_MS) {
    lastMetalSampleAt = now;
    if (digitalRead(METAL_SENSOR_PIN) == METAL_ACTIVE_LEVEL && metalHits < 255) metalHits++;
  }

  if (elapsed >= SENSOR_CONFIRM_MS) {
    const bool metalDetected = metalHits >= METAL_REQUIRED_HITS;
    Serial.println(metalDetected ? "EVENT METAL_DETECTED" : "EVENT METAL_NOT_DETECTED");
    currentObject = metalDetected ? OBJECT_CAN : OBJECT_PET;
    startServoSort(true);
  }
}

void updateServo(unsigned long now) {
  if (machineState == STATE_SERVO_OUT && now - stateStartedAt >= SERVO_HOLD_MS) {
    sorterServo.write(SERVO_CENTER_ANGLE);
    machineState = STATE_SERVO_RETURN;
    stateStartedAt = now;
  } else if (machineState == STATE_SERVO_RETURN && now - stateStartedAt >= SERVO_RETURN_MS) {
    finishSort();
  }
}

void updateRejecting(unsigned long now) {
  if (now - stateStartedAt >= MOTOR_TIMEOUT_MS) {
    motorStop();
    machineState = STATE_WAIT_CLEAR;
    Serial.println("ERROR REJECT_TIMEOUT");
  }
}

void setup() {
  Serial.begin(115200);
  serialBuffer.reserve(64);

  pinMode(MOTOR_IN1_PIN, OUTPUT);
  pinMode(MOTOR_IN2_PIN, OUTPUT);
  pinMode(ULTRASONIC_TRIG_PIN, OUTPUT);
  pinMode(ULTRASONIC_ECHO_PIN, INPUT);
  pinMode(METAL_SENSOR_PIN, INPUT_PULLUP);

  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
  motorStop();

  sorterServo.attach(SERVO_PIN);
  sorterServo.write(SERVO_CENTER_ANGLE);
  delay(500);

  Serial.println("BRAVOFOREST_RVM 1.0");
  enterIdle();
}

void loop() {
  const unsigned long now = millis();
  readSerialCommands();

  switch (machineState) {
    case STATE_FEEDING:
      updateFeeding(now);
      break;
    case STATE_CHECKING_METAL:
      updateMetalCheck(now);
      break;
    case STATE_SERVO_OUT:
    case STATE_SERVO_RETURN:
      updateServo(now);
      break;
    case STATE_REJECTING:
      updateRejecting(now);
      break;
    default:
      break;
  }
}

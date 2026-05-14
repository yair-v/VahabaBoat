from smbus2 import SMBus
import requests
import time
import socket

# DHT11 libraries
# Install by running: ./install_pi.sh
import board
import adafruit_dht

# =============================
# CHANGE THESE SETTINGS
# =============================
SERVER_URL = "https://YOUR-RENDER-APP.onrender.com/api/update"
API_KEY = "change-me-12345"
DEVICE_ID = "pi-water-1"
DEVICE_NAME = "Raspberry Pi Water + DHT11 Sensor 1"
SEND_EVERY_SECONDS = 5

# Grove Water Level Sensor addresses
LOW_ADDR = 0x77
HIGH_ADDR = 0x78
THRESHOLD = 100

# DHT11 data pin
# Recommended physical pin: 11 = GPIO17 = board.D17
DHT_PIN = board.D17

bus = SMBus(1)
dht = adafruit_dht.DHT11(DHT_PIN)


def read_i2c_sensor(addr, length):
    try:
        return bus.read_i2c_block_data(addr, 0, length)
    except Exception as e:
        print(f"I2C read error from {hex(addr)}: {e}")
        return None


def get_water_level():
    low_data = read_i2c_sensor(LOW_ADDR, 8)
    high_data = read_i2c_sensor(HIGH_ADDR, 12)

    if low_data is None or high_data is None:
        return None, low_data or [], high_data or []

    active = 0

    for value in low_data:
        if value > THRESHOLD:
            active += 1

    for value in high_data:
        if value > THRESHOLD:
            active += 1

    level = active * 5
    level = max(0, min(100, level))

    return level, low_data, high_data


def get_dht11():
    try:
        temperature = dht.temperature
        humidity = dht.humidity

        if temperature is None or humidity is None:
            return None, None, "DHT11 no data"

        return round(float(temperature), 1), round(float(humidity), 1), None

    except RuntimeError as e:
        # DHT11 sometimes fails one reading. This is normal.
        return None, None, str(e)

    except Exception as e:
        return None, None, str(e)


def internet_ok():
    try:
        socket.create_connection(("8.8.8.8", 53), timeout=3)
        return True
    except OSError:
        return False


def send_update(level, low_data, high_data, temperature, humidity, dht_error):
    payload = {
        "deviceId": DEVICE_ID,
        "name": DEVICE_NAME,
        "waterLevel": level,
        "temperatureC": temperature,
        "humidity": humidity,
        "dhtError": dht_error,
        "rawLow": low_data,
        "rawHigh": high_data,
    }

    headers = {
        "x-api-key": API_KEY,
        "Content-Type": "application/json",
    }

    response = requests.post(SERVER_URL, json=payload, headers=headers, timeout=10)
    response.raise_for_status()
    return response.json()


print("====================================")
print(" Raspberry Pi Water + DHT11 Client")
print("====================================")
print("Water: 0% = GOOD / GREEN")
print("Water: 100% = DANGER / RED")
print("DHT11 DATA pin: GPIO17 / physical pin 11")
print("Device:", DEVICE_ID)
print("Server:", SERVER_URL)
print("====================================")

while True:
    level, low_data, high_data = get_water_level()
    temperature, humidity, dht_error = get_dht11()

    if level is None:
        print("Water sensor error. Check I2C wiring and run: i2cdetect -y 1")
    else:
        print(f"Water level: {level}% | LOW={low_data} | HIGH={high_data}")

    if dht_error:
        print("DHT11:", dht_error)
    else:
        print(f"DHT11: {temperature}C | {humidity}%")

    if not internet_ok():
        print("No internet connection")
        time.sleep(SEND_EVERY_SECONDS)
        continue

    try:
        result = send_update(level, low_data, high_data, temperature, humidity, dht_error)
        print("Sent to cloud:", result.get("ok"))
    except Exception as e:
        print("Cloud send error:", e)

    time.sleep(SEND_EVERY_SECONDS)

from smbus2 import SMBus
import requests
import time
import socket

import board
import adafruit_dht

import digitalio
import busio
from PIL import Image, ImageDraw, ImageFont
from adafruit_rgb_display import ili9341

# =============================
# SETTINGS
# =============================

SERVER_URL = "https://vahababoat.onrender.com/api/update"
API_KEY = "Yair$!(^hila**78)"

DEVICE_ID = "pi-water-1"
DEVICE_NAME = "Raspberry Pi Water + DHT11 Sensor 1"

SEND_EVERY_SECONDS = 5

LOW_ADDR = 0x77
HIGH_ADDR = 0x78
THRESHOLD = 100

DHT_PIN = board.D17

# =============================
# DISPLAY SETTINGS - ILI9341
# =============================

spi = busio.SPI(clock=board.SCK, MOSI=board.MOSI)

cs_pin = digitalio.DigitalInOut(board.CE0)
dc_pin = digitalio.DigitalInOut(board.D24)
reset_pin = digitalio.DigitalInOut(board.D25)

display = ili9341.ILI9341(
    spi,
    cs=cs_pin,
    dc=dc_pin,
    rst=reset_pin,
    baudrate=32000000,
    rotation=0,
)

WIDTH = 240
HEIGHT = 320

image = Image.new("RGB", (WIDTH, HEIGHT))
draw = ImageDraw.Draw(image)

font = ImageFont.load_default()

# =============================
# COLORS
# =============================

BLACK = (0, 0, 0)
BG = (8, 18, 35)
CARD = (22, 34, 55)
WHITE = (255, 255, 255)
MUTED = (150, 165, 185)
GREEN = (0, 255, 120)
RED = (255, 60, 60)
ORANGE = (255, 170, 0)
CYAN = (0, 255, 255)
PURPLE = (220, 80, 255)

# =============================
# SENSORS
# =============================

bus = SMBus(1)
dht = None


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
    global dht

    try:
        if dht is None:
            dht = adafruit_dht.DHT11(DHT_PIN)

        temperature = dht.temperature
        humidity = dht.humidity

        if temperature is None or humidity is None:
            return None, None, "DHT11 no data"

        return round(float(temperature), 1), round(float(humidity), 1), None

    except RuntimeError as e:
        return None, None, str(e)

    except Exception as e:
        print("DHT11 critical error:", e)

        try:
            dht.exit()
        except:
            pass

        dht = None

        return None, None, "DHT11 disconnected"


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
        "waterLevel": level if level is not None else -1,
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

    response = requests.post(
        SERVER_URL,
        json=payload,
        headers=headers,
        timeout=10,
    )

    response.raise_for_status()
    return response.json()


# =============================
# DISPLAY
# =============================

def water_color(level):
    if level is None:
        return RED

    if level <= 20:
        return GREEN

    if level <= 60:
        return ORANGE

    return RED


def draw_bar(x, y, w, h, percent, color):
    draw.rectangle((x, y, x + w, y + h), outline=(70, 85, 110), width=2)

    if percent is None:
        percent = 0

    fill_w = int(w * percent / 100)

    if fill_w > 4:
        draw.rectangle(
            (x + 2, y + 2, x + fill_w - 2, y + h - 2),
            fill=color,
        )


def draw_dashboard(level, temperature, humidity, dht_error, cloud_ok, internet_status):
    draw.rectangle((0, 0, WIDTH, HEIGHT), fill=BG)

    # Header
    draw.rectangle((0, 0, WIDTH, 42), fill=(10, 30, 60))
    draw.text((10, 10), "Vahaba Boat", font=font, fill=WHITE)

    if cloud_ok:
        draw.text((175, 10), "ONLINE", font=font, fill=GREEN)
    else:
        draw.text((175, 10), "LOCAL", font=font, fill=ORANGE)

    # Water card
    draw.rounded_rectangle((10, 55, 230, 150), radius=12,
                           fill=CARD, outline=(55, 70, 95))

    draw.text((20, 66), "Water Level", font=font, fill=CYAN)

    if level is None:
        level_text = "--%"
        status = "WATER SENSOR ERROR"
        color = RED
    else:
        level_text = f"{level}%"
        color = water_color(level)

        if level <= 20:
            status = "GOOD"
        elif level <= 60:
            status = "WARNING"
        else:
            status = "DANGER"

    draw.text((20, 92), level_text, font=font, fill=WHITE)
    draw_bar(20, 115, 200, 22, level, color)
    draw.text((20, 140), status, font=font, fill=color)

    # Temp/Humidity card
    draw.rounded_rectangle((10, 165, 230, 245), radius=12,
                           fill=CARD, outline=(55, 70, 95))

    draw.text((20, 176), "Temperature / Humidity", font=font, fill=PURPLE)

    if dht_error:
        draw.text((20, 203), "DHT ERROR", font=font, fill=RED)
        draw.text((20, 224), "Temp: --   Hum: --", font=font, fill=MUTED)
    else:
        draw.text((20, 203), f"Temp: {temperature} C", font=font, fill=CYAN)
        draw.text((20, 224), f"Hum : {humidity} %", font=font, fill=PURPLE)

    # Status card
    draw.rounded_rectangle((10, 260, 230, 310), radius=12,
                           fill=CARD, outline=(55, 70, 95))

    if not internet_status:
        draw.text((20, 276), "Internet: OFFLINE", font=font, fill=RED)
    else:
        draw.text((20, 276), "Internet: OK", font=font, fill=GREEN)

    draw.text((20, 294), time.strftime("%H:%M:%S"), font=font, fill=MUTED)

    display.image(image)


# =============================
# MAIN
# =============================

print("====================================")
print(" Raspberry Pi Water + DHT11 + ILI9341")
print("====================================")
print("Device:", DEVICE_ID)
print("Server:", SERVER_URL)
print("Display: ILI9341 240x320")
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

    internet_status = internet_ok()
    cloud_ok = False

    if not internet_status:
        print("No internet connection")
    else:
        try:
            result = send_update(
                level,
                low_data,
                high_data,
                temperature,
                humidity,
                dht_error,
            )

            cloud_ok = bool(result.get("ok"))
            print("Sent to cloud:", cloud_ok)

        except Exception as e:
            print("Cloud send error:", e)

    draw_dashboard(
        level,
        temperature,
        humidity,
        dht_error,
        cloud_ok,
        internet_status,
    )

    time.sleep(SEND_EVERY_SECONDS)

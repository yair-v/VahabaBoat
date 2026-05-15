# Vahaba Boat Monitor APK

פרויקט Android Studio מלא ליצירת APK.

## מה יש בפנים
- WebView שמציג את הדשבורד: https://vahababoat.onrender.com
- שירות רקע Foreground Service
- בדיקת API כל 15 שניות
- התראה קולית אם טמפ׳ מעל 40°C
- התראה קולית אם מפלס מים מעל 20%
- כפתור Start / Stop

## איך בונים APK
1. לפתוח Android Studio
2. File → Open
3. לבחור את תיקיית VahabaBoatAndroid
4. לחכות ל־Gradle Sync
5. Build → Build Bundle(s) / APK(s) → Build APK(s)

ה־APK יופיע בדרך כלל ב:
app/build/outputs/apk/debug/app-debug.apk

## התקנה בטלפון
להעביר את APK לטלפון ולהתקין.
ייתכן שצריך לאפשר Install unknown apps.

## חשוב
בפעם הראשונה יש לאשר הרשאת Notifications.
האפליקציה מפעילה שירות רקע עם התראה קבועה כדי שאנדרואיד לא יסגור אותה מהר.

## שינוי ספים
בקובץ:
app/src/main/java/com/vahaba/boatmonitor/MonitorService.java

לשנות:
TEMP_LIMIT = 40
WATER_LIMIT = 20

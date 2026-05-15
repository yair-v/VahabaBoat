package com.vahaba.boatmonitor;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class MonitorService extends Service {

    private static final String CHANNEL_ID = "vahaba_boat_monitor";
    private static final int FOREGROUND_NOTIFICATION_ID = 8081;
    private static final int ALERT_NOTIFICATION_ID = 8082;

    private final Handler handler = new Handler();

    private long lastTempAlarmTime = 0;
    private long lastHumAlarmTime = 0;
    private long lastWaterAlarmTime = 0;

    private final Runnable monitorLoop = new Runnable() {
        @Override
        public void run() {
            checkServer();
            handler.postDelayed(this, 15000);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();

        createChannel();

        startForeground(
                FOREGROUND_NOTIFICATION_ID,
                buildSilentForegroundNotification()
        );

        handler.post(monitorLoop);
    }

    private void checkServer() {
        new Thread(() -> {
            try {
                URL url = new URL(AppSettings.BASE_URL + "/api/devices");

                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);

                BufferedReader br = new BufferedReader(
                        new InputStreamReader(conn.getInputStream())
                );

                StringBuilder sb = new StringBuilder();
                String line;

                while ((line = br.readLine()) != null) {
                    sb.append(line);
                }

                br.close();

                JSONObject root = new JSONObject(sb.toString());
                JSONArray devices = root.optJSONArray("devices");

                if (devices == null) {
                    return;
                }

                int tempLimit = AppSettings.temp(this);
                int humLimit = AppSettings.hum(this);
                int waterLimit = AppSettings.water(this);

                boolean tempEnabled = AppSettings.tempEnabled(this);
                boolean humEnabled = AppSettings.humEnabled(this);
                boolean waterEnabled = AppSettings.waterEnabled(this);

                for (int i = 0; i < devices.length(); i++) {
                    JSONObject d = devices.getJSONObject(i);

                    boolean online = d.optBoolean("online", false);

                    if (!online) {
                        continue;
                    }

                    String name = d.optString(
                            "name",
                            d.optString("deviceId", "device")
                    );

                    double temp = d.optDouble("temperatureC", -999);
                    double hum = d.optDouble("humidity", -999);
                    int water = d.optInt("waterLevel", 0);

                    long now = System.currentTimeMillis();

                    if (
                            tempEnabled &&
                                    temp >= tempLimit &&
                                    now - lastTempAlarmTime > 30000
                    ) {
                        lastTempAlarmTime = now;

                        triggerRealAlert(
                                "אזהרת טמפרטורה",
                                name + ": הטמפרטורה גבוהה מהסף - " + temp + "°C"
                        );
                    }

                    if (
                            humEnabled &&
                                    hum >= humLimit &&
                                    now - lastHumAlarmTime > 30000
                    ) {
                        lastHumAlarmTime = now;

                        triggerRealAlert(
                                "אזהרת לחות",
                                name + ": הלחות גבוהה מהסף - " + hum + "%"
                        );
                    }

                    if (
                            waterEnabled &&
                                    water >= waterLimit &&
                                    now - lastWaterAlarmTime > 30000
                    ) {
                        lastWaterAlarmTime = now;

                        triggerRealAlert(
                                "אזהרת מפלס מים",
                                name + ": מפלס המים גבוה מהסף - " + water + "%"
                        );
                    }
                }

            } catch (Exception ignored) {
            }
        }).start();
    }

    private void triggerRealAlert(String title, String text) {
        playAlarm(AppSettings.sound(this));

        NotificationManager manager =
                (NotificationManager) getSystemService(NOTIFICATION_SERVICE);

        if (manager != null) {
            manager.notify(
                    ALERT_NOTIFICATION_ID,
                    buildAlertNotification(title, text)
            );
        }
    }

    private void playAlarm(int soundType) {
        try {
            ToneGenerator tone = new ToneGenerator(AudioManager.STREAM_ALARM, 100);

            int toneCode = ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD;

            if (soundType == 1) {
                toneCode = ToneGenerator.TONE_PROP_BEEP;
            }

            if (soundType == 2) {
                toneCode = ToneGenerator.TONE_SUP_ERROR;
            }

            int finalToneCode = toneCode;

            tone.startTone(finalToneCode, 1300);

            handler.postDelayed(() -> {
                try {
                    tone.startTone(finalToneCode, 1300);
                } catch (Exception ignored) {
                }
            }, 1800);

        } catch (Exception ignored) {
        }
    }

    private Notification buildSilentForegroundNotification() {
        Intent openAppIntent = new Intent(this, MainActivity.class);

        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                openAppIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                        ? PendingIntent.FLAG_IMMUTABLE
                        : 0
        );

        Notification.Builder builder =
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        ? new Notification.Builder(this, CHANNEL_ID)
                        : new Notification.Builder(this);

        builder
                .setContentTitle("")
                .setContentText("")
                .setSmallIcon(android.R.drawable.ic_menu_upload)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setShowWhen(false)
                .setLocalOnly(true)
                .setPriority(Notification.PRIORITY_MIN);

        return builder.build();
    }

    private Notification buildAlertNotification(String title, String text) {
        Intent openAppIntent = new Intent(this, MainActivity.class);

        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                1,
                openAppIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                        ? PendingIntent.FLAG_IMMUTABLE
                        : 0
        );

        Notification.Builder builder =
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        ? new Notification.Builder(this, CHANNEL_ID)
                        : new Notification.Builder(this);

        builder
                .setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setPriority(Notification.PRIORITY_HIGH);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            builder.setColor(0xFFEF4444);
        }

        return builder.build();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Vahaba Boat Alerts",
                    NotificationManager.IMPORTANCE_HIGH
            );

            channel.setDescription(
                    "Only threshold alerts for temperature, humidity and water level"
            );

            NotificationManager manager =
                    getSystemService(NotificationManager.class);

            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(monitorLoop);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
package com.vahaba.boatmonitor;

import android.content.Context;
import android.content.SharedPreferences;

public class AppSettings {

    public static final String BASE_URL = "https://vahababoat.onrender.com";
    public static final String PREFS = "vahaba_settings";

    public static final String KEY_NIGHT = "night";
    public static final String KEY_ZOOM = "zoom";
    public static final String KEY_SOUND = "sound";

    public static final String KEY_TEMP = "temp";
    public static final String KEY_HUM = "hum";
    public static final String KEY_WATER = "water";

    public static final String KEY_TEMP_ENABLED = "temp_enabled";
    public static final String KEY_HUM_ENABLED = "hum_enabled";
    public static final String KEY_WATER_ENABLED = "water_enabled";

    public static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static boolean night(Context c) {
        return prefs(c).getBoolean(KEY_NIGHT, true);
    }

    public static int zoom(Context c) {
        return prefs(c).getInt(KEY_ZOOM, 100);
    }

    public static int sound(Context c) {
        return prefs(c).getInt(KEY_SOUND, 0);
    }

    public static int temp(Context c) {
        return prefs(c).getInt(KEY_TEMP, 40);
    }

    public static int hum(Context c) {
        return prefs(c).getInt(KEY_HUM, 80);
    }

    public static int water(Context c) {
        return prefs(c).getInt(KEY_WATER, 20);
    }

    public static boolean tempEnabled(Context c) {
        return prefs(c).getBoolean(KEY_TEMP_ENABLED, true);
    }

    public static boolean humEnabled(Context c) {
        return prefs(c).getBoolean(KEY_HUM_ENABLED, true);
    }

    public static boolean waterEnabled(Context c) {
        return prefs(c).getBoolean(KEY_WATER_ENABLED, true);
    }
}
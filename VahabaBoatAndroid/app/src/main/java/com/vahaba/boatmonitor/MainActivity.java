package com.vahaba.boatmonitor;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.Window;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;

public class MainActivity extends Activity {

    private WebView webView;
    private FrameLayout root;
    private LinearLayout appShell;
    private TextView titleView;
    private TextView subTitleView;
    private Button menuButton;

    private final int BG = Color.parseColor("#0B1220");
    private final int CARD = Color.parseColor("#111827");
    private final int BLUE = Color.parseColor("#38BDF8");
    private final int GREEN = Color.parseColor("#22C55E");
    private final int TEXT = Color.WHITE;
    private final int MUTED = Color.parseColor("#94A3B8");

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 21) {
            w.setStatusBarColor(BG);
            w.setNavigationBarColor(BG);
        }

        requestNotificationPermission();
        startMonitorService();
        buildUi();
    }

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }

    private GradientDrawable round(int color, int radius) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radius));
        return g;
    }

    private GradientDrawable roundStroke(int color, int radius, int strokeColor) {
        GradientDrawable g = round(color, radius);
        g.setStroke(dp(1), strokeColor);
        return g;
    }

    private void buildUi() {
        root = new FrameLayout(this);
        root.setBackgroundColor(BG);

        appShell = new LinearLayout(this);
        appShell.setOrientation(LinearLayout.VERTICAL);
        appShell.setBackgroundColor(BG);
        appShell.setPadding(dp(14), dp(14), dp(14), dp(10));

        LinearLayout topCard = new LinearLayout(this);
        topCard.setOrientation(LinearLayout.HORIZONTAL);
        topCard.setGravity(Gravity.CENTER_VERTICAL);
        topCard.setPadding(dp(14), dp(12), dp(14), dp(12));
        topCard.setBackground(roundStroke(CARD, 24, Color.parseColor("#263244")));

        ImageView logo = new ImageView(this);
        logo.setImageResource(getResources().getIdentifier("app_logo", "drawable", getPackageName()));
        LinearLayout.LayoutParams logoLp = new LinearLayout.LayoutParams(dp(44), dp(44));
        logoLp.setMargins(0, 0, dp(12), 0);
        topCard.addView(logo, logoLp);

        LinearLayout titleBox = new LinearLayout(this);
        titleBox.setOrientation(LinearLayout.VERTICAL);
        titleBox.setGravity(Gravity.CENTER_VERTICAL);

        titleView = new TextView(this);
        titleView.setText("Vahaba Boat");
        titleView.setTextColor(TEXT);
        titleView.setTextSize(21);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        titleView.setSingleLine(true);

        subTitleView = new TextView(this);
        subTitleView.setText("Cloud monitoring · Water · DHT11");
        subTitleView.setTextColor(MUTED);
        subTitleView.setTextSize(12);
        subTitleView.setSingleLine(true);

        titleBox.addView(titleView);
        titleBox.addView(subTitleView);
        topCard.addView(titleBox, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));

        menuButton = new Button(this);
        menuButton.setText("☰");
        menuButton.setTextSize(24);
        menuButton.setTextColor(Color.WHITE);
        menuButton.setTypeface(Typeface.DEFAULT_BOLD);
        menuButton.setBackground(round(GREEN, 18));
        menuButton.setAllCaps(false);
        menuButton.setOnClickListener(v -> showSettings());

        LinearLayout.LayoutParams menuLp = new LinearLayout.LayoutParams(dp(64), dp(54));
        topCard.addView(menuButton, menuLp);

        LinearLayout.LayoutParams topLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        topLp.setMargins(0, dp(2), 0, dp(12));
        appShell.addView(topCard, topLp);

        FrameLayout webCard = new FrameLayout(this);
        webCard.setBackground(roundStroke(Color.parseColor("#070D18"), 28, Color.parseColor("#263244")));
        webCard.setPadding(dp(2), dp(2), dp(2), dp(2));

        webView = new WebView(this);
        webView.setBackgroundColor(BG);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setTextZoom(AppSettings.zoom(this));
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                applyMode();
                webView.getSettings().setTextZoom(AppSettings.zoom(MainActivity.this));
            }
        });

        webCard.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        appShell.addView(webCard, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1
        ));

        root.addView(appShell);
        setContentView(root);

        webView.loadUrl(AppSettings.BASE_URL);
    }

    private TextView label(String text) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextColor(TEXT);
        t.setTextSize(16);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setPadding(0, dp(18), 0, dp(8));
        return t;
    }

    private void showSettings() {
        SharedPreferences p = AppSettings.prefs(this);

        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(BG);

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(24), dp(18), dp(24), dp(18));
        box.setBackground(roundStroke(CARD, 26, Color.parseColor("#263244")));
        scroll.addView(box);

        TextView header = new TextView(this);
        header.setText("הגדרות מערכת");
        header.setTextColor(TEXT);
        header.setTextSize(26);
        header.setGravity(Gravity.CENTER);
        header.setTypeface(Typeface.DEFAULT_BOLD);
        header.setPadding(0, dp(8), 0, dp(14));
        box.addView(header);

        Switch nightSwitch = new Switch(this);
        nightSwitch.setText("מצב לילה");
        nightSwitch.setTextColor(TEXT);
        nightSwitch.setTextSize(18);
        nightSwitch.setChecked(AppSettings.night(this));
        nightSwitch.setPadding(0, dp(8), 0, dp(8));
        box.addView(nightSwitch);

        TextView zoomText = label("זום: " + AppSettings.zoom(this) + "%");
        box.addView(zoomText);

        SeekBar zoomBar = new SeekBar(this);
        zoomBar.setMax(40);
        zoomBar.setProgress(AppSettings.zoom(this) - 85);
        zoomBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                zoomText.setText("זום: " + (85 + progress) + "%");
            }

            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });
        box.addView(zoomBar);

        box.addView(label("צליל התראה"));

        Spinner soundSpinner = new Spinner(this);
        String[] sounds = {"אזעקה", "צפצוף קצר", "התראה חזקה"};
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, sounds);
        soundSpinner.setAdapter(adapter);
        soundSpinner.setSelection(AppSettings.sound(this));
        box.addView(soundSpinner);

        Switch tempSwitch = new Switch(this);
        tempSwitch.setText("התראות טמפרטורה");
        tempSwitch.setTextColor(TEXT);
        tempSwitch.setTextSize(18);
        tempSwitch.setChecked(AppSettings.tempEnabled(this));
        tempSwitch.setPadding(0, dp(18), 0, dp(8));
        box.addView(tempSwitch);

        TextView tempText = label("סף טמפרטורה: " + AppSettings.temp(this) + "°C");
        box.addView(tempText);

        SeekBar tempBar = new SeekBar(this);
        tempBar.setMax(60);
        tempBar.setProgress(AppSettings.temp(this) - 20);
        tempBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                tempText.setText("סף טמפרטורה: " + (20 + progress) + "°C");
            }

            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });
        box.addView(tempBar);

        Switch humSwitch = new Switch(this);
        humSwitch.setText("התראות לחות");
        humSwitch.setTextColor(TEXT);
        humSwitch.setTextSize(18);
        humSwitch.setChecked(AppSettings.humEnabled(this));
        humSwitch.setPadding(0, dp(18), 0, dp(8));
        box.addView(humSwitch);

        TextView humText = label("סף לחות: " + AppSettings.hum(this) + "%");
        box.addView(humText);

        SeekBar humBar = new SeekBar(this);
        humBar.setMax(100);
        humBar.setProgress(AppSettings.hum(this));
        humBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                humText.setText("סף לחות: " + progress + "%");
            }

            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });
        box.addView(humBar);

        Switch waterSwitch = new Switch(this);
        waterSwitch.setText("התראות מפלס מים");
        waterSwitch.setTextColor(TEXT);
        waterSwitch.setTextSize(18);
        waterSwitch.setChecked(AppSettings.waterEnabled(this));
        waterSwitch.setPadding(0, dp(18), 0, dp(8));
        box.addView(waterSwitch);

        TextView waterText = label("סף גובה מים: " + AppSettings.water(this) + "%");
        box.addView(waterText);

        SeekBar waterBar = new SeekBar(this);
        waterBar.setMax(100);
        waterBar.setProgress(AppSettings.water(this));
        waterBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                waterText.setText("סף גובה מים: " + progress + "%");
            }

            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });
        box.addView(waterBar);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setView(scroll)
                .setPositiveButton("שמור", (d, which) -> {
                    p.edit()
                            .putBoolean(AppSettings.KEY_NIGHT, nightSwitch.isChecked())
                            .putInt(AppSettings.KEY_ZOOM, 85 + zoomBar.getProgress())
                            .putInt(AppSettings.KEY_SOUND, soundSpinner.getSelectedItemPosition())
                            .putInt(AppSettings.KEY_TEMP, 20 + tempBar.getProgress())
                            .putInt(AppSettings.KEY_HUM, humBar.getProgress())
                            .putInt(AppSettings.KEY_WATER, waterBar.getProgress())
                            .putBoolean(AppSettings.KEY_TEMP_ENABLED, tempSwitch.isChecked())
                            .putBoolean(AppSettings.KEY_HUM_ENABLED, humSwitch.isChecked())
                            .putBoolean(AppSettings.KEY_WATER_ENABLED, waterSwitch.isChecked())
                            .apply();

                    webView.getSettings().setTextZoom(AppSettings.zoom(this));
                    applyMode();

                    stopService(new Intent(this, MonitorService.class));
                    startMonitorService();
                })
                .setNegativeButton("ביטול", null)
                .create();

        dialog.setOnShowListener(d -> {
            if (dialog.getWindow() != null) {
                dialog.getWindow().setBackgroundDrawable(round(BG, 28));
            }
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(GREEN);
            dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setTextColor(BLUE);
        });

        dialog.show();
    }

    private void applyMode() {
        if (webView == null) return;

        if (AppSettings.night(this)) {
            appShell.setBackgroundColor(BG);
            webView.evaluateJavascript(
                    "document.body.style.background='#0d1117';" +
                            "document.body.style.color='#ffffff';" +
                            "document.querySelectorAll('header,.card,.summaryBox').forEach(e=>{e.style.background='#161b22';e.style.color='#ffffff';e.style.borderColor='#30363d';});" +
                            "document.querySelectorAll('.inner,.sensorBox').forEach(e=>{e.style.background='#0d1117';e.style.color='#ffffff';});" +
                            "document.querySelectorAll('.subtitle,.small,.meta,.summaryBox span,.sensorBox span').forEach(e=>{e.style.color='#8b949e';});",
                    null
            );
        } else {
            appShell.setBackgroundColor(Color.parseColor("#F1F5F9"));
            webView.evaluateJavascript(
                    "document.body.style.background='#f6f8fa';" +
                            "document.body.style.color='#111111';" +
                            "document.querySelectorAll('header,.card,.summaryBox').forEach(e=>{e.style.background='#ffffff';e.style.color='#111111';e.style.borderColor='#d0d7de';});" +
                            "document.querySelectorAll('.inner,.sensorBox').forEach(e=>{e.style.background='#f6f8fa';e.style.color='#111111';});" +
                            "document.querySelectorAll('.subtitle,.small,.meta,.summaryBox span,.sensorBox span').forEach(e=>{e.style.color='#57606a';});",
                    null
            );
        }
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }
    }

    private void startMonitorService() {
        Intent intent = new Intent(this, MonitorService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
    }
}
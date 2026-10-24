const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withNotificationChannel(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const application = manifest.application[0];
    const entries = application['meta-data'] || (application['meta-data'] = []);
    const name = 'com.google.firebase.messaging.default_notification_channel_id';
    let entry = entries.find((item) => item.$['android:name'] === name);
    if (!entry) {
      entry = { $: { 'android:name': name } };
      entries.push(entry);
    }
    entry.$['android:value'] = 'default';
    const replacements = new Set((entry.$['tools:replace'] || '').split(',').map((value) => value.trim()).filter(Boolean));
    replacements.add('android:value');
    entry.$['tools:replace'] = [...replacements].join(',');
    return config;
  });
};

import {
  View,
  StyleSheet,
  Text,
  TextInput,
  Image
} from "react-native"

import React, { useEffect, useState } from 'react';

import { useVoiceClient } from '../context/VoiceClientContext';

import Colors from '../theme/Colors';
import { Images } from '../theme/Assets';
import CustomButton from '../theme/CustomButton';
import { SettingsManager } from '../settings/SettingsManager';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: Colors.backgroundApp,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: 64,
    height: 64,
    marginBottom: 20,
  },
  header: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  textInput: {
    width: '100%',
    padding: 10,
    borderColor: Colors.buttonsBorder,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderRadius: 5,
    marginBottom: 10,
  },
  lastTextInput: {
    marginBottom: 20,
  },
});

const PreJoinView: React.FC = () => {
  const { start } = useVoiceClient();

  const [backendURL, setBackendURL] = useState<string>('')
  const [dailyApiKey, setDailyApiKey] = useState(process.env.EXPO_PUBLIC_DAILY_API_KEY || '');

  useEffect(() => {
    const loadSettings = async () => {
      const loadedSettings = await SettingsManager.getSettings();
      setBackendURL(loadedSettings.backendURL)
      setDailyApiKey(loadedSettings.dailyApiKey)
    };
    loadSettings();
  }, []);

  return (
    <View style={styles.container}>
      <Image source={Images.dailyBot} style={styles.image} />
      <Text style={styles.header}>Connect to a Daily Bot.</Text>
      <TextInput
        placeholder="Daily API Key"
        value={dailyApiKey}
        onChangeText={setDailyApiKey}
        style={styles.textInput}
        secureTextEntry={true}
      />
      <TextInput
        placeholder="Server URL"
        value={backendURL}
        onChangeText={setBackendURL}
        style={[styles.textInput, styles.lastTextInput]}
      />
      <CustomButton
        title="Connect"
        onPress={() => start(dailyApiKey, backendURL)}
        backgroundColor={Colors.backgroundCircle}
      />
    </View>
  )
};

export default PreJoinView;

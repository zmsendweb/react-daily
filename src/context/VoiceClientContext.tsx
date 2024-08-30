import React, { createContext, useState, useContext, ReactNode, useCallback, useMemo, useRef, useEffect } from 'react'
import Toast from 'react-native-toast-message'
import { DailyVoiceClient } from 'react-native-realtime-ai-daily'
import { TransportState, VoiceMessage } from 'realtime-ai'
import { MediaStreamTrack } from '@daily-co/react-native-webrtc'
import { SettingsManager } from '../settings/SettingsManager';

interface VoiceClientContextProps {
  voiceClient: DailyVoiceClient | null
  inCall: boolean
  currentState: string
  botReady: boolean
  localAudioLevel: number
  remoteAudioLevel: number
  isMicEnabled: boolean
  isCamEnabled: boolean
  videoTrack?: MediaStreamTrack
  timerCountDown: number
  // methods
  start: (apiKey: string, url: string) => Promise<void>
  leave: () => void
  toggleMicInput: () => void
  toggleCamInput: () => void
}

export const VoiceClientContext = createContext<VoiceClientContextProps | undefined>(undefined)

interface VoiceClientProviderProps {
  children: ReactNode
}

export const VoiceClientProvider: React.FC<VoiceClientProviderProps> = ({ children }) => {
  const [voiceClient, setVoiceClient] = useState<DailyVoiceClient | null>(null)
  const [inCall, setInCall] = useState<boolean>(false)
  const [currentState, setCurrentState] = useState<TransportState>("idle")
  const [botReady, setBotReady] = useState<boolean>(false)
  const [isMicEnabled, setIsMicEnabled] = useState<boolean>(false)
  const [isCamEnabled, setIsCamEnabled] = useState<boolean>(false)
  const [videoTrack, setVideoTrack] = useState<MediaStreamTrack>()
  const [localAudioLevel, setLocalAudioLevel] = useState<number>(0)
  const [remoteAudioLevel, setRemoteAudioLevel] = useState<number>(0)
  const [timerCountDown, setTimerCountDown] = useState<number>(0)

  const botSpeakingRef = useRef(false)
  let meetingTimer: NodeJS.Timeout | null

  const createVoiceClient = useCallback((apiKey: string, url: string): DailyVoiceClient => {
    return new DailyVoiceClient({
      baseUrl: url,
      enableMic: true,
      services: {
        llm: "together",
        tts: "cartesia",
      },
      config: [
        {
          service: "tts",
          options: [
            { name: "voice", value: "79a125e8-cd45-4c13-8a67-188112f4dd22" },
          ],
        },
        {
          service: "llm",
          options: [
            { name: "model", value: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo" },
            {
              name: "initial_messages",
              value: [
                {
                  role: "system",
                  content:
                    "You are a assistant called ExampleBot. You can ask me anything. Keep responses brief and legible. Your responses will converted to audio. Please do not include any special characters in your response other than '!' or '?'. Start by briefly introducing yourself.",
                },
              ],
            },
            { name: "run_on_config", value: true },
          ],
        },
      ],
      // Note: In a production environment, it is recommended to avoid calling Daily's API endpoint directly.
      // Instead, you should route requests through your own server to handle authentication, validation,
      // and any other necessary logic. Therefore, the baseUrl should be set to the URL of your own server.
      customHeaders: {
        "Authorization": `Bearer ${apiKey}`
      },
      customBodyParams: {
        "bot_profile": "voice_2024_08",
        "max_duration": 680
      },
      timeout: 15 * 1000,
      enableCam: false,
    })
  }, [])

  const handleError = useCallback((error: any) => {
    console.log("Error occurred:", error)
    const errorMessage = error.message || error.data?.error || "An unexpected error occurred"
    Toast.show({
      type: 'error',
      text1: errorMessage,
    })
  }, [])

  const setupListeners = useCallback((voiceClient: DailyVoiceClient): void => {
    const inCallStates = new Set(["authenticating", "connecting", "connected", "ready"])

    voiceClient
      .on("transportStateChanged", (state) => {
        setCurrentState(voiceClient.state)
        setInCall(inCallStates.has(state))
      })
      .on("error", (error: VoiceMessage) => {
        handleError(error)
      })
      .on("botReady", () => {
        setBotReady(true)
        let expirationTime = voiceClient.transportExpiry
        if (expirationTime) {
          startTimer(expirationTime)
        }
      })
      .on("disconnected", () => {
        setBotReady(false)
        stopTimer()
        setIsMicEnabled(false)
        setIsCamEnabled(false)
      })
      .on("localAudioLevel", (level) => {
          setLocalAudioLevel(level)
      })
      .on("remoteAudioLevel", (level) => {
        if (botSpeakingRef.current) {
          setRemoteAudioLevel(level)
        }
      })
      .on("userStartedSpeaking", () => {
        // nothing to do here
      })
      .on("userStoppedSpeaking", () => {
        setLocalAudioLevel(0)
      })
      .on("botStartedSpeaking", () => {
        botSpeakingRef.current = true
      })
      .on("botStoppedSpeaking", () => {
        botSpeakingRef.current = false
        setRemoteAudioLevel(0)
      })
      .on("connected", () => {
        setIsMicEnabled(voiceClient.isMicEnabled)
        setIsCamEnabled(voiceClient.isCamEnabled)
      })
      .on("trackStarted", (track, participant) => {
        if (participant?.local && track.kind === 'video'){
          setVideoTrack(track)
        }
      })
  }, [handleError])

  const start = useCallback(async (apiKey: string, url: string): Promise<void> => {
    const client = createVoiceClient(apiKey, url)
    setVoiceClient(client)
    setupListeners(client)
    try {
      await client.start()
      // updating the preferences
      const newSettings = await SettingsManager.getSettings();
      newSettings.dailyApiKey = apiKey
      newSettings.backendURL = url
      await SettingsManager.updateSettings(newSettings)
    } catch (error) {
      handleError(error)
    }
  }, [createVoiceClient, setupListeners, handleError])

  const leave = useCallback(async (): Promise<void> => {
    if (voiceClient) {
      await voiceClient.disconnect()
      setVoiceClient(null)
    }
  }, [voiceClient])

  const toggleMicInput = useCallback(async (): Promise<void> => {
    if (voiceClient) {
      try {
        let enableMic = !isMicEnabled
        voiceClient.enableMic(enableMic)
        setIsMicEnabled(enableMic)
      } catch (e) {
        handleError(e)
      }
    }
  }, [voiceClient, isMicEnabled])

  const toggleCamInput = useCallback(async (): Promise<void> => {
    if (voiceClient) {
      try {
        let enableCam = !isCamEnabled
        voiceClient.enableCam(enableCam)
        setIsCamEnabled(enableCam)
      } catch (e) {
        handleError(e)
      }
    }
  }, [voiceClient, isCamEnabled])

  const startTimer = (expirationTime: number): void => {
    const currentTime = Math.floor(Date.now() / 1000)
    const leftTime = expirationTime - currentTime
    setTimerCountDown(leftTime)
    meetingTimer = setInterval(() => {
      setTimerCountDown((prevCountDown) => {
        return prevCountDown - 1
      })
    }, 1000)
  }

  const stopTimer = (): void => {
      if (meetingTimer) {
      clearInterval(meetingTimer)
      meetingTimer = null
    }
    setTimerCountDown(0)
  }

  useEffect(() => {
    return () => {
      if (voiceClient) {
        voiceClient.removeAllListeners() // Cleanup on unmount
      }
    }
  }, [voiceClient])

  const contextValue = useMemo(() => ({
    voiceClient,
    inCall,
    currentState,
    botReady,
    isMicEnabled,
    isCamEnabled,
    localAudioLevel,
    remoteAudioLevel,
    videoTrack,
    timerCountDown,
    start,
    leave,
    toggleMicInput,
    toggleCamInput
  }), [voiceClient, inCall, currentState, botReady, isMicEnabled, isCamEnabled, localAudioLevel, remoteAudioLevel, videoTrack, timerCountDown, start, leave, toggleMicInput, toggleCamInput])

  return (
    <VoiceClientContext.Provider value={contextValue}>
      {children}
    </VoiceClientContext.Provider>
  )
}

export const useVoiceClient = (): VoiceClientContextProps => {
  const context = useContext(VoiceClientContext)
  if (!context) {
    throw new Error('useVoiceClient must be used within a VoiceClientProvider')
  }
  return context
}
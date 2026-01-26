import { InitSilkOptions, InitWaaPOptions } from '@human.tech/waap-sdk'

export const passportApiKey = process.env.NEXT_PUBLIC_API_KEY
export const passportScorerId = process.env.NEXT_PUBLIC_SCORER_ID
export const passportScoreThreshold = 25

export const useStagingSilk = false

export const silkUrl = useStagingSilk
  ? 'https://staging.waap.xyz/'
  : 'https://waap.xyz/'

export const silkConfig: InitWaaPOptions = {
  // useStaging: true,
  config: {
    // darkMode: false,
    allowedSocials: ['google', 'twitter', 'discord', 'github'],
    authenticationMethods: ['email', 'phone', 'social'],
    styles: {
      darkMode: false,
    },
  },
  project: {
    entryTitle: 'WaaP on Stellar',
  }
}

export interface PlatformSettingsData {
  platformName: string
  platformVersion: string
  deploymentRegion: string
  timezone: string
  currency: string
  supportedLanguages: string[]
  databaseCluster: {
    controlPlane: string
    status: string
    isolationModel: string
    tlsMode: string
    poolSize: number
  }
  smsGateway: {
    provider: string
    status: string
    senderId: string
    template: string
  }
  emailService: {
    provider: string
    host: string
    from: string
    status: string
  }
  whatsappService: {
    provider: string
    status: string
  }
  fcmNotification: {
    provider: string
    status: string
  }
  razorpaySaaS: {
    scope: string
    status: string
    farmerPayoutBoundary: string
  }
  securityPolicies: {
    rateLimit: string
    sessionTtl: string
    tokenAlgorithm: string
    credentialStorage: string
    leastPrivilege: string
  }
}

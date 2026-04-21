export default async (req, res) => {
  res.json({
    status: 'ok',
    ai_provider: process.env.AI_PROVIDER || 'gemini',
    has_gemini: !!process.env.GEMINI_API_KEY,
    has_apify: !!process.env.APIFY_API_TOKEN,
    has_apollo: !!process.env.APOLLO_API_KEY,
    has_linkedin: !!process.env.LINKEDIN_SESSION_COOKIE,
  })
}


import { kv } from "@vercel/kv";

export default async function handler(req: any, res: any) {
  // Vercel Cron Jobs are GET requests by default
  try {
    // Perform a simple read operation to trigger activity in Upstash
    // We don't even need the key to exist, the attempt to read counts as traffic
    await kv.get('keep-alive-ping');
    
    console.log("KV Keep-Alive: Ping successful at " + new Date().toISOString());
    
    return res.status(200).json({ 
      success: true, 
      message: "Vercel KV Keep-Alive successful. Database activity recorded." 
    });
  } catch (error) {
    console.error("KV Keep-Alive failed:", error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}

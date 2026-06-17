import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { formatCurrency } from '@/services/engine/utils/savings-math';

const apiKey = process.env.GEMINI_API_KEY;

// Initialize the client if key exists
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export async function POST(request: Request) {
  try {
    const { result } = await request.json();

    if (!result) {
      return NextResponse.json({ error: 'Missing audit result data' }, { status: 400 });
    }

    if (!ai) {
      // If no API key is configured, instantly throw to trigger the client-side fallback
      throw new Error('Gemini API key is not configured');
    }

    // Abstracted prompt ensuring a short, professional executive summary
    const prompt = `
      You are an expert financial auditor for software engineering teams. 
      Generate a brief, punchy, 2-to-3 sentence executive summary based on the following deterministic audit data:
      
      - Current Annual Spend: ${formatCurrency(result.currentAnnualSpend)}
      - Optimized Annual Spend: ${formatCurrency(result.optimizedAnnualSpend)}
      - Total Annual Savings Found: ${formatCurrency(result.totalAnnualSavings)}
      - Number of distinct optimization recommendations: ${result.recommendations?.length || 0}
      
      Do NOT include any greetings, fluff, or markdown formatting (no bold/italics). 
      Make it sound professional, direct, and focused on the financial impact. 
      Do NOT invent any numbers. Only use the numbers provided above.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const summary = response.text;

    if (!summary) {
      throw new Error('Gemini returned an empty response');
    }

    return NextResponse.json({ summary });
  } catch (error) {
    console.error('Failed to generate AI summary:', error);
    // We return a 500 status. The client will gracefully handle this by displaying a fallback.
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}

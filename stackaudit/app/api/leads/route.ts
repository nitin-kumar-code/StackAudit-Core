import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { z } from 'zod';

const leadSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  company_name: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsedData = leadSchema.safeParse(body);

    if (!parsedData.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsedData.error.format() },
        { status: 400 }
      );
    }

    const { email, company_name } = parsedData.data;

    // Insert into Supabase
    const { data, error } = await supabaseAdmin
      .from('leads')
      .insert([
        { 
          email, 
          company_name,
        }
      ])
      .select('id')
      .single();

    if (error) {
      console.error('Supabase error inserting lead:', error);
      // Handle unique violation if email already exists
      if (error.code === '23505') {
        return NextResponse.json({ message: 'Email already subscribed' }, { status: 200 });
      }
      return NextResponse.json({ error: 'Failed to save lead' }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error in leads route:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

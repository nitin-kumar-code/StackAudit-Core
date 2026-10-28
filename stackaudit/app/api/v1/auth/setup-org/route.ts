import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase/client';
import { getAuthUser, UnauthorizedError } from '../../../../../lib/auth';

/**
 * Provisions an organization for a newly registered user and securely stamps
 * their app_metadata using the service-role key. This closes the A4 vulnerability loop.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    
    // Check if user already has an org
    if (user.app_metadata?.organization_id) {
      return NextResponse.json({ 
        error: 'User is already associated with an organization' 
      }, { status: 400 });
    }

    const { organizationName } = await req.json();
    if (!organizationName || typeof organizationName !== 'string') {
      return NextResponse.json({ error: 'organizationName is required' }, { status: 400 });
    }

    // 1. Create the Organization in the database
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({ name: organizationName })
      .select('id')
      .single();

    if (orgError || !org) {
      throw new Error(`Failed to create organization: ${orgError?.message}`);
    }

    // 2. Securely update the user's app_metadata using the admin client
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { app_metadata: { organization_id: org.id } }
    );

    if (updateError) {
      // Rollback org creation if auth update fails
      await supabaseAdmin.from('organizations').delete().eq('id', org.id);
      throw new Error(`Failed to update user app_metadata: ${updateError.message}`);
    }

    return NextResponse.json({ 
      success: true, 
      organizationId: org.id 
    }, { status: 200 });

  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Setup Org Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

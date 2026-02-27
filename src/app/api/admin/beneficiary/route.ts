import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { beneficiaries } from '@/lib/schema';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ethAddress, stellarAddress } = body;

    if (!ethAddress || !stellarAddress) {
      return NextResponse.json({ error: 'ethAddress and stellarAddress are required' }, { status: 400 });
    }

    // Insert to Neon DB
    await db.insert(beneficiaries).values({
      ethAddress: ethAddress,
      stellarAddress: stellarAddress
    }).onConflictDoUpdate({
      target: beneficiaries.ethAddress,
      set: { stellarAddress: stellarAddress }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error saving beneficiary:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

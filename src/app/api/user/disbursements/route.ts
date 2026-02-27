import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { beneficiaries, disbursements } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const ethAddress = searchParams.get("ethAddress");

    if (!ethAddress) {
      return NextResponse.json({ error: "ethAddress is required" }, { status: 400 });
    }

    // 1. Find beneficiary by address
    const userBeneficiaries = await db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.ethAddress, ethAddress))
      .limit(1);

    if (userBeneficiaries.length === 0) {
      return NextResponse.json({ disbursements: [] });
    }

    const user = userBeneficiaries[0];

    // 2. Fetch all their disbursements
    const userDisbursements = await db
      .select()
      .from(disbursements)
      .where(eq(disbursements.beneficiaryId, user.id));

    return NextResponse.json({
      disbursements: userDisbursements,
    });
  } catch (error: unknown) {
    console.error("Error fetching user disbursements:", error);
    return NextResponse.json(
      { error: "Failed to fetch disbursements", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

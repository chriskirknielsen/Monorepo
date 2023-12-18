import { NextRequest, NextResponse } from "next/server";
import { captureException } from "@sentry/nextjs";
import { getUnnormalizedData } from "~/lib/normalization/actions/getUnnormalizedData";

// Avoid statically rendering route handlers
export const dynamic = "force-dynamic"


export async function GET(req: NextRequest, res: NextResponse) {
  const surveyId = req.nextUrl.searchParams.get("surveyId");
  const editionId = req.nextUrl.searchParams.get("editionId");
  const questionId = req.nextUrl.searchParams.get("questionId");
  try {
    const data = await getUnnormalizedData({
      surveyId,
      editionId,
      questionId,
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error(error);
    captureException(error);
    return NextResponse.json(
      {
        error: {
          id: "load_scripts_error",
          status: 500,
          message: error.message,
          error,
        },
      },
      { status: 500 }
    );
  }
}

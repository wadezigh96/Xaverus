import {NextResponse} from "next/server";
import {integrationStatus} from "../../../lib/okx";
export async function GET(){return NextResponse.json({service:"xaverus",integrations:integrationStatus(),safety:{serverSidePolicyRequired:true,secretsNeverClientSide:true}})}
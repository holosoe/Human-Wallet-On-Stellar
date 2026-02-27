import { db } from '@/lib/db'
import { beneficiaries, disbursements } from '@/lib/schema'
import { eq, desc } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export default async function BeneficiaryDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: beneficiaryId } = await params
  
  // Fetch beneficiary details
  const beneficiary = await db.select().from(beneficiaries).where(eq(beneficiaries.id, beneficiaryId)).limit(1).then(res => res[0])
  
  if (!beneficiary) {
    return <div>Beneficiary not found</div>
  }

  // Fetch past disbursements
  const pastDisbursements = await db.select()
    .from(disbursements)
    .where(eq(disbursements.beneficiaryId, beneficiaryId))
    .orderBy(desc(disbursements.createdAt))

  const handleCreateDisbursement = async (formData: FormData) => {
    'use server';
    
    const amount = formData.get('amount') as string;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return;

    await db.insert(disbursements).values({
      beneficiaryId: beneficiaryId,
      amount: amount
    });
    
    revalidatePath(`/admin/beneficiary/${beneficiaryId}`);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900">Beneficiary Details</h3>
          <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="px-4 py-5 bg-gray-50 shadow rounded-lg overflow-hidden sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">Ethereum Address</dt>
              <dd className="mt-1 text-sm font-semibold text-gray-900 break-all">{beneficiary.ethAddress}</dd>
            </div>
            <div className="px-4 py-5 bg-gray-50 shadow rounded-lg overflow-hidden sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">Stellar Address</dt>
              <dd className="mt-1 text-sm font-semibold text-gray-900 break-all">{beneficiary.stellarAddress || 'Not Deployed'}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900">Create New Disbursement</h3>
          <div className="mt-2 max-w-xl text-sm text-gray-500">
            <p>Allocate funds to this user. The user will need to redeem this amount on the frontend by signing a transaction.</p>
          </div>
          <form action={handleCreateDisbursement} className="mt-5 sm:flex sm:items-center">
            <div className="w-full sm:max-w-xs">
              <label htmlFor="amount" className="sr-only">Amount (XLM)</label>
              <input
                type="number"
                name="amount"
                id="amount"
                min="0.1"
                step="0.01"
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-4 py-2 border"
                placeholder="Amount (XLM)"
                required
              />
            </div>
            <button
              type="submit"
              className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Allocate Funds
            </button>
          </form>
        </div>
      </div>

      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">Past Disbursements</h3>
          {pastDisbursements.length === 0 ? (
            <p className="text-sm text-gray-500">No disbursements yet.</p>
          ) : (
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Date</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Amount (XLM)</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status / TxHash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {pastDisbursements.map((d) => (
                    <tr key={d.id}>
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-gray-500 sm:pl-6">{new Date(d.createdAt).toLocaleString()}</td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">{d.amount}</td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {d.txHash ? (
                          <span className="text-green-600 text-xs break-all">{d.txHash}</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                            Pending Redemption
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

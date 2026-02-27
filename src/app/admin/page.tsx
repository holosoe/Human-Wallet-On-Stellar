import { db } from '@/lib/db'
import { beneficiaries, disbursements } from '@/lib/schema'
import { sql } from 'drizzle-orm'
import Link from 'next/link'

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const result = await db.select({
    id: beneficiaries.id,
    ethAddress: beneficiaries.ethAddress,
    stellarAddress: beneficiaries.stellarAddress,
    createdAt: beneficiaries.createdAt,
    totalDisbursements: sql<string>`coalesce(sum(CAST(${disbursements.amount} AS numeric)), 0)`
  })
  .from(beneficiaries)
  .leftJoin(disbursements, sql`${beneficiaries.id} = ${disbursements.beneficiaryId}`)
  .groupBy(beneficiaries.id)
  .orderBy(beneficiaries.createdAt);

  return (
    <div>
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Beneficiaries</h1>
          <p className="mt-2 text-sm text-gray-700">A list of all users receiving disbursements.</p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <Link href="/admin/add" className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto">
            Add beneficiary
          </Link>
        </div>
      </div>
      <div className="mt-8 flex flex-col">
        <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Eth Address</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Stellar Address</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Total Disbursed (XLM)</th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                      <span className="sr-only">View</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {result.map((b) => (
                    <tr key={b.id}>
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">{b.ethAddress}</td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{b.stellarAddress || 'Not deployed'}</td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{b.totalDisbursements}</td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <Link href={`/admin/beneficiary/${b.id}`} className="text-indigo-600 hover:text-indigo-900">View</Link>
                      </td>
                    </tr>
                  ))}
                  {result.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-sm text-gray-500">No beneficiaries found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

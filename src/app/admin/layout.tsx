import Link from 'next/link';
import React from 'react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col w-full text-black">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">Admin Portal</h1>
          <nav>
            <Link href="/admin" className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md font-medium">Beneficiaries</Link>
            <Link href="/admin/add" className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md font-medium">Add Beneficiary</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {children}
      </main>
    </div>
  );
}

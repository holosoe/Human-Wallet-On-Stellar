'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AddBeneficiaryPage() {
  const router = useRouter()
  const [ethAddress, setEthAddress] = useState('')
  const [status, setStatus] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setStatus('Checking deployment status...')

    try {
      // 1. Check if wallet natively exists
      let stellarAddress = ''
      const checkRes = await fetch('/api/wallet/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ethAddress })
      })
      const checkData = await checkRes.json()

      if (checkData.exists) {
        setStatus('Contract already deployed.')
        stellarAddress = checkData.contractAddress
      } else {
        setStatus('Deploying wallet on Stellar...')
        const deployRes = await fetch('/api/wallet/deploy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ethAddress })
        })
        const deployData = await deployRes.json()
        
        if (!deployData.success) {
          throw new Error(deployData.error || 'Failed to deploy')
        }
        stellarAddress = deployData.contractAddress
        setStatus('Wallet deployed successfully.')
      }

      setStatus('Saving to database...')
      const saveRes = await fetch('/api/admin/beneficiary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ethAddress, stellarAddress })
      })
      
      if (!saveRes.ok) {
        throw new Error('Failed to save to database: ' + await saveRes.text())
      }
      
      setStatus('Success! Redirecting...')
      router.push('/admin')
      router.refresh()
    } catch (error: any) {
      console.error(error)
      setStatus(`Error: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto mt-10">
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900">Add New Beneficiary</h3>
          <div className="mt-2 max-w-xl text-sm text-gray-500">
            <p>Enter an Ethereum address. The system will automatically deploy a Stellar smart contract proxy wallet for this user.</p>
          </div>
          <form className="mt-5 sm:flex sm:items-center" onSubmit={handleSubmit}>
            <div className="w-full sm:max-w-xs">
              <label htmlFor="ethAddress" className="sr-only">Ethereum Address</label>
              <input
                type="text"
                name="ethAddress"
                id="ethAddress"
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-4 py-2 border"
                placeholder="0x..."
                value={ethAddress}
                onChange={e => setEthAddress(e.target.value)}
                pattern="^0x[a-fA-F0-9]{40}$"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || ethAddress.length !== 42}
              className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
            >
              Add User
            </button>
          </form>
          {status && (
            <div className="mt-4 text-sm text-indigo-600 font-medium">
              {status}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

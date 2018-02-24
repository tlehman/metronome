/*
    The MIT License (MIT)

    Copyright 2017 - 2018, Alchemy Limited, LLC.

    Permission is hereby granted, free of charge, to any person obtaining
    a copy of this software and associated documentation files (the
    "Software"), to deal in the Software without restriction, including
    without limitation the rights to use, copy, modify, merge, publish,
    distribute, sublicense, and/or sell copies of the Software, and to
    permit persons to whom the Software is furnished to do so, subject to
    the following conditions:

    The above copyright notice and this permission notice shall be included
    in all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
    OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
    MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
    IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
    CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
    TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
    SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

const assert = require('chai').assert
const MTNToken = artifacts.require('MTNToken')
const SmartToken = artifacts.require('SmartToken')
const Proceeds = artifacts.require('Proceeds')
const AutonomousConverter = artifacts.require('AutonomousConverter')
const Auctions = artifacts.require('Auctions')
const TokenPorter = artifacts.require('TokenPorter')
const ethjsABI = require('ethjs-abi')

contract('TokenPorter', accounts => {
  const OWNER = accounts[0]
  const MTN_INITIAL_SUPPLY = 0
  const SMART_INITIAL_SUPPLY = 0
  const DECMULT = 10 ** 18
  const MINIMUM_PRICE = 33 * 10 ** 11 // minimum wei per token
  const STARTING_PRICE = 2 // 2ETH per MTN
  const TIME_SCALE = 1

  let mtnToken, smartToken, proceeds, autonomousConverter, auctions, tokenPorter

  function getCurrentBlockTime () {
    var defaultBlock = web3.eth.defaultBlock
    return web3.eth.getBlock(defaultBlock).timestamp
  }

  async function initContracts (startTime, minimumPrice, startingPrice, timeScale) {
    mtnToken = await MTNToken.new(autonomousConverter.address, auctions.address, MTN_INITIAL_SUPPLY, DECMULT, {from: OWNER})
    smartToken = await SmartToken.new(autonomousConverter.address, autonomousConverter.address, SMART_INITIAL_SUPPLY, {from: OWNER})
    await autonomousConverter.init(mtnToken.address, smartToken.address, proceeds.address, auctions.address,
      {
        from: OWNER,
        value: web3.toWei(1, 'ether')
      })
    await proceeds.initProceeds(autonomousConverter.address, auctions.address, {from: OWNER})
    const founders = []
    // Since we are appending it with hexadecimal address so amount should also be
    // in hexa decimal. Hence 999999e18 = 0000d3c20dee1639f99c0000 in 24 character ( 96 bits)
    // 1000000e18 =  0000d3c20dee1639f99c0000
    founders.push(OWNER + '0000d3c20dee1639f99c0000')
    founders.push(accounts[1] + '000069e10de76676d0000000')
    const EXT_FOUNDER = accounts[6]
    await auctions.mintInitialSupply(founders, EXT_FOUNDER, mtnToken.address, proceeds.address, {from: OWNER})
    await auctions.initAuctions(startTime, minimumPrice, startingPrice, timeScale, {from: OWNER})
    tokenPorter = await TokenPorter.new(mtnToken.address, auctions.address)
    await mtnToken.setTokenPorter(tokenPorter.address)
  }

  // Create contracts and initilize them for each test case
  beforeEach(async () => {
    proceeds = await Proceeds.new()
    autonomousConverter = await AutonomousConverter.new()
    auctions = await Auctions.new()
  })

  describe('initialized', () => {
    it('proper initialization', () => {
      return new Promise(async (resolve, reject) => {
        await initContracts(getCurrentBlockTime() - 60, MINIMUM_PRICE, STARTING_PRICE, TIME_SCALE)

        const auctionAddr = await tokenPorter.auctions()
        assert.equal(auctionAddr, auctions.address, 'Auctions address is not the same')

        const tokenAddr = await tokenPorter.token()
        assert.equal(tokenAddr, mtnToken.address, 'Token address is not the same')

        resolve()
      })
    })
  })

  describe('export', () => {
    it('successful export', () => {
      return new Promise(async (resolve, reject) => {
        await initContracts(getCurrentBlockTime() - 60, MINIMUM_PRICE, STARTING_PRICE, TIME_SCALE)

        // get some balance for export, half MTN
        const buyer = accounts[7]
        const amount = 1e18
        await auctions.sendTransaction({ from: buyer, value: amount })

        var totalSupplyBefore = await mtnToken.totalSupply()
        var mtTokenBalanceBefore = await mtnToken.balanceOf(buyer)
        assert.isAbove(mtTokenBalanceBefore.toNumber(), 0, 'Buyer has no MTN Tokens to export')

        // export all tokens tokens
        const expectedDestChain = 'ETH'
        const expectedExtraData = 'extra data'
        const tx = await mtnToken.export(
          web3.fromAscii(expectedDestChain),
          mtnToken.address,
          buyer,
          mtTokenBalanceBefore,
          web3.fromAscii(expectedExtraData),
          { from: buyer })

        // check for burn
        assert.equal(tx.logs.length, 2, 'Incorrect number of logs emitted')
        const burnLog = tx.logs[1]
        assert.equal(burnLog.event, 'Transfer', 'Burn was not emitted')
        assert.equal(burnLog.args._from, buyer, 'From is wrong')
        assert.equal(burnLog.args._to, 0x0, 'To is wrong')
        assert.equal(burnLog.args._value.toNumber(), mtTokenBalanceBefore.toNumber(), 'Value is wrong')

        // check for export receipt
        const decoder = ethjsABI.logDecoder(tokenPorter.abi)
        const tokenPorterEvents = decoder(tx.receipt.logs)
        assert.equal(tokenPorterEvents.length, 1, 'Incorrect number of logs emitted')
        const logExportReceipt = tokenPorterEvents[0]
        assert.equal(logExportReceipt._eventName, 'ExportReceiptLog', 'Log name is wrong')
        const amountToBurn = parseInt(logExportReceipt.amountToBurn.toString(), 10)
        assert.equal(amountToBurn, mtTokenBalanceBefore.toNumber(), 'Amounts are different')
        const destinationChain = logExportReceipt.destinationChain
        assert.equal(web3.toHex(destinationChain), web3.toHex(web3.fromAscii(expectedDestChain)) + '0000000000', 'Dest Chain is different')
        const destMetronomeAddr = logExportReceipt.destinationMetronomeAddr
        assert.equal(destMetronomeAddr, mtnToken.address, 'Dest MetronomeAddr is different')
        const destinationRecipientAddr = logExportReceipt.destinationRecipientAddr
        assert.equal(destinationRecipientAddr, buyer, 'Dest Recipient is different')
        const extraData = logExportReceipt.extraData
        assert.equal(web3.toHex(extraData), web3.toHex(web3.fromAscii(expectedExtraData)), 'Extra Data is different')
        const currentTick = logExportReceipt.currentTick
        assert.equal(currentTick.toNumber(), (await auctions.currentTick()).toNumber(), 'Current Tick is different')
        const burnSequence = logExportReceipt.burnSequence
        assert.equal(burnSequence.toNumber(), 1, 'burnSequence is different')

        // TODO: is there a way to validate without an import?
        var totalSupplyAfter = await mtnToken.totalSupply()
        const currentBurnHash = logExportReceipt.currentBurnHash
        assert.isNotEmpty(currentBurnHash, 'Burn Hash is empty')
        const prevBurnHash = logExportReceipt.prevBurnHash
        assert.isNotEmpty(prevBurnHash, 'Prev Burn Hash is empty')
        const dailyMintable = logExportReceipt.dailyMintable
        assert.isNotEmpty(dailyMintable, 'Prev Burn Hash is empty')
        const supplyOnAllChains = logExportReceipt.supplyOnAllChains
        assert.equal(supplyOnAllChains.length, 6, 'Supply On All Chains is wrong length')
        assert.equal(parseInt(supplyOnAllChains[0].toString(), 10), totalSupplyAfter.toNumber(), 'First chain is not non-zero')
        assert.equal(supplyOnAllChains[1].toString(), '0', 'First chain is not non-zero')
        assert.equal(supplyOnAllChains[2].toString(), '0', 'First chain is not zero')
        assert.equal(supplyOnAllChains[3].toString(), '0', 'First chain is not zero')
        assert.equal(supplyOnAllChains[4].toString(), '0', 'First chain is not zero')
        assert.equal(supplyOnAllChains[5].toString(), '0', 'First chain is not zero')

        assert.isAbove(logExportReceipt.genesisTime.toNumber(), 0, 'genesisTime is wrong')

        // reconcile balances
        var mtTokenBalanceAfter = await mtnToken.balanceOf(buyer)
        assert.equal(totalSupplyBefore.sub(totalSupplyAfter).toNumber(), amountToBurn, 'After export, total supply is not correct')
        assert.equal(mtTokenBalanceBefore.sub(mtTokenBalanceAfter).toNumber(), amountToBurn, 'After export, mtnTokenBalance is not correct')
        assert.equal(mtTokenBalanceAfter.toNumber(), 0, 'mtnTokenBalance after export should be zero')

        resolve()
      })
    })
  })
})
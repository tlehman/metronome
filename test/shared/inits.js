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

const TestRPCTime = require('./time')
const AutonomousConverter = artifacts.require('AutonomousConverter')
const Auctions = artifacts.require('Auctions')
const MTNToken = artifacts.require('MTNToken')
const Proceeds = artifacts.require('Proceeds')
const SmartToken = artifacts.require('SmartToken')

const Tests = {
  initContracts: (OWNER, FOUNDER, EXT_FOUNDER, ALICE) => {
    return new Promise(async (resolve, reject) => {
      const autonomousConverter = await AutonomousConverter.new({from: OWNER})
      const auctions = await Auctions.new({from: OWNER})
      const proceeds = await Proceeds.new({from: OWNER})

      const founders = []
      founders.push(OWNER + '0000d3c20dee1639f99c0000')
      founders.push(FOUNDER + '000069e10de76676d0000000')

      const MTN_INITIAL_SUPPLY = 0
      const ST_INITIAL_SUPPLY = 2
      const DECMULT = 10 ** 18
      const MINIMUM_PRICE = 1000
      const STARTING_PRICE = 1
      const TIME_SCALE = 1
      await TestRPCTime.mineBlock()
      const START_TIME = TestRPCTime.getCurrentBlockTime()

      const mtnToken = await MTNToken.new(autonomousConverter.address, auctions.address, MTN_INITIAL_SUPPLY, DECMULT, {from: OWNER})
      const smartToken = await SmartToken.new(autonomousConverter.address, autonomousConverter.address, ST_INITIAL_SUPPLY, {from: OWNER})
      await autonomousConverter.init(mtnToken.address, smartToken.address, auctions.address, { from: OWNER, value: web3.toWei(1, 'ether') })
      await proceeds.initProceeds(autonomousConverter.address, auctions.address, {from: OWNER})
      await auctions.mintInitialSupply(founders, EXT_FOUNDER, mtnToken.address, proceeds.address, {from: OWNER})
      await auctions.initAuctions(START_TIME, MINIMUM_PRICE, STARTING_PRICE, TIME_SCALE, {from: OWNER})

      resolve({
        mtnToken: mtnToken,
        autonomousConverter: autonomousConverter,
        auctions: auctions,
        proceeds: proceeds,
        smartToken: smartToken
      })
    })
  }
}

module.exports = Tests
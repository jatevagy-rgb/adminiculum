#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'); const root=path.resolve(__dirname,'..','..'),review=path.join(root,'docs/compliance/legal-review');
const coveragePath=path.join(review,'source-coverage.json'), coverage=JSON.parse(fs.readFileSync(coveragePath,'utf8'));
const oecd=coverage.coverage.find(x=>x.sourceKey==='HU:ACT:2000:XXXVII');
if(!oecd) throw Error('OECD promulgation source absent');
oecd.coverageStatus='NO_DIRECT_COMPANY_REQUIREMENT_IDENTIFIED';
oecd.reviewMethod='SUBSTANTIVE_LEGAL_REVIEW';
oecd.reviewedProvisions=['1. §','OECD Egyezmény 1. cikk (state criminalisation)','2. cikk (legal-person liability)','8. cikk (state accounting measures)'];
oecd.reviewNotes='INCORPORATED_PROMULGATED source. The reviewed text establishes contracting-state criminalisation, legal-person liability and state accounting-law measures; it does not itself prescribe a generic company anti-bribery policy, gifts limit, training record or third-party due-diligence document.';
oecd.unreviewedReason=null;
fs.writeFileSync(coveragePath,JSON.stringify(coverage,null,2)+'\n');
const pack=path.join(review,'LEGAL_REVIEW_PACK.md'); const heading='## Corporate integrity / anti-bribery';
if(!fs.readFileSync(pack,'utf8').includes(heading)) fs.appendFileSync(pack,`\n${heading}\n\n- **HU:ACT:2000:XXXVII**: Hungarian promulgation of the OECD Convention. Reviewed state-level criminalisation, legal-person liability and accounting-law measures. **No direct company compliance-template requirement extracted.** No foreign-law nexus rule was created because UK Bribery Act and FCPA primary source text are absent from the corpus.\n`);
console.log(JSON.stringify({reviewedSource:oecd.sourceKey,status:oecd.coverageStatus,newRequirements:0,newRules:0,newFacts:0}));

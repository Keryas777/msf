#!/usr/bin/env python3
"""Calibrate only from capture-grouped out-of-fold predictions.

The input benchmark stays local. The output contains category-level counts and
threshold summaries only; it never writes field values, capture IDs, glyphs,
or provenance. Holdout captures are read only after thresholds are frozen from
captures 01-07.
"""
import argparse, json
from pathlib import Path

DEFAULT_SCORE_THRESHOLD=0.79
DEFAULT_MARGIN_THRESHOLD=0.035
CATEGORIES=('score','trophy')

def eligible(row, min_score=DEFAULT_SCORE_THRESHOLD):
    seg=row.get('segmentation') or {}
    return bool(row.get('candidate')) and row.get('expected') is not None and row.get('minScore',0)>=min_score and not seg.get('warnings')

def choose_threshold(rows, min_score=DEFAULT_SCORE_THRESHOLD):
    """Midpoint between the strongest wrong and weakest stronger correct OOF margin."""
    rows=[r for r in rows if eligible(r,min_score)]
    wrong=[float(r['minMargin']) for r in rows if not r.get('candidateExact')]
    correct=[float(r['minMargin']) for r in rows if r.get('candidateExact')]
    if not wrong or not correct:return None
    highest_wrong=max(wrong)
    separated=[m for m in correct if m>highest_wrong]
    if not separated:return None
    return (highest_wrong+min(separated))/2

def evaluate(rows, threshold, missing_class=False, min_score=DEFAULT_SCORE_THRESHOLD, enforce_class_gate=True):
    rows=[r for r in rows if r.get('expected') is not None]
    proposals=sum(bool(r.get('candidateExact')) for r in rows)
    accepted=[]
    if threshold is not None and (not missing_class or not enforce_class_gate):
        accepted=[r for r in rows if eligible(r,min_score) and float(r['minMargin'])>=threshold]
    return {'fields':len(rows),'proposalsExact':proposals,'accepted':len(accepted),'acceptedExact':sum(bool(r.get('candidateExact')) for r in accepted),'wrongAccepted':sum(not bool(r.get('candidateExact')) for r in accepted),'refused':len(rows)-len(accepted)}

def nested_capture_holdout(rows, missing_class=False, enforce_class_gate=True):
    capture_ids=sorted({r['captureId'] for r in rows})
    tests=[];thresholds=[]
    for capture_id in capture_ids:
        calibration=[r for r in rows if r['captureId']!=capture_id]
        test=[r for r in rows if r['captureId']==capture_id]
        threshold=choose_threshold(calibration)
        if threshold is not None:thresholds.append(threshold)
        result=evaluate(test,threshold,missing_class=missing_class,enforce_class_gate=enforce_class_gate)
        tests.append(result)
    return {'heldOutCaptureCount':len(capture_ids),'thresholdAvailableFolds':len(thresholds),'thresholdMin':round(min(thresholds),6) if thresholds else None,'thresholdMax':round(max(thresholds),6) if thresholds else None,'fields':sum(x['fields'] for x in tests),'accepted':sum(x['accepted'] for x in tests),'acceptedExact':sum(x['acceptedExact'] for x in tests),'wrongAccepted':sum(x['wrongAccepted'] for x in tests),'refused':sum(x['refused'] for x in tests)}

def margins(rows):
    groups={'correct':[],'incorrect':[]}
    for r in rows:
        if eligible(r):groups['correct' if r.get('candidateExact') else 'incorrect'].append(float(r['minMargin']))
    return {k:{'n':len(v),'min':round(min(v),6) if v else None,'median':round(sorted(v)[len(v)//2],6) if v else None,'max':round(max(v),6) if v else None} for k,v in groups.items()}

def calibrate(benchmark):
    cv=[r for fold in benchmark['folds'] for r in fold['rows']]
    holdout=benchmark['holdout']
    output={'schema':'war-results-confidence-calibration-v1','thresholdSource':'captures 01-07 only; capture-grouped out-of-fold predictions','defaultThresholds':{'minSimilarity':DEFAULT_SCORE_THRESHOLD,'minMargin':DEFAULT_MARGIN_THRESHOLD},'categories':{}}
    for category in CATEGORIES:
        train=[r for r in cv if r['category']==category]
        test=[r for r in holdout if r['category']==category]
        model=benchmark.get('models',{}).get(category,{})
        missing=bool(model.get('missingDigits'))
        threshold=choose_threshold(train)
        out={'missingModelDigits':len(model.get('missingDigits',[])),'crossValidationMargins':margins(train),'holdoutMargins':margins(test),'crossValidationDefault':evaluate(train,DEFAULT_MARGIN_THRESHOLD,missing_class=missing),'holdoutDefault':evaluate(test,DEFAULT_MARGIN_THRESHOLD,missing_class=missing),'selectedThreshold':round(threshold,6) if threshold is not None else None,'crossValidationSelectedHypothetical':evaluate(train,threshold,missing_class=missing,enforce_class_gate=False),'crossValidationSelectedWithClassGate':evaluate(train,threshold,missing_class=missing,enforce_class_gate=True),'holdoutSelectedHypothetical':evaluate(test,threshold,missing_class=missing,enforce_class_gate=False),'holdoutSelectedWithClassGate':evaluate(test,threshold,missing_class=missing,enforce_class_gate=True),'nestedCaptureHoldoutHypothetical':nested_capture_holdout(train,missing_class=missing,enforce_class_gate=False),'nestedCaptureHoldoutWithClassGate':nested_capture_holdout(train,missing_class=missing,enforce_class_gate=True)}
        out['refusalReasons']={'crossValidation':{reason or 'accepted-by-current-rules':sum(r.get('reason')==reason for r in train) for reason in sorted({r.get('reason') for r in train},key=lambda x:x or '')},'holdout':{reason or 'accepted-by-current-rules':sum(r.get('reason')==reason for r in test) for reason in sorted({r.get('reason') for r in test},key=lambda x:x or '')}}
        output['categories'][category]=out
    output['allFields']={'crossValidation':{'fields':len(cv),'proposalExact':sum(bool(r.get('candidateExact')) for r in cv),'tesseractExact':sum(bool(r.get('tesseractExact')) for r in cv)},'holdout':{'fields':len(holdout),'proposalExact':sum(bool(r.get('candidateExact')) for r in holdout),'tesseractExact':sum(bool(r.get('tesseractExact')) for r in holdout)}}
    return output

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--input',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    data=json.loads(args.input.read_text());result=calibrate(data);args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=='__main__':main()

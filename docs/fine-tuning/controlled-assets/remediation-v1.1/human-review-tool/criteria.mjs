// The approved register's 12 criteria, plus the three explicit Phase 1C.4H additions.
export const CRITERIA=Object.freeze([
 ['languageMeaning','Language meaning','Does the wording express the expected request and scope?'],
 ['dialectNaturalness','Language naturalness / dialect','Check English, MSA, Jordanian Arabic or natural code switching, as labelled.'],
 ['privacyPIIAllFields','Privacy / PII','Inspect text, context, plans and metadata for real identities or sensitive HR facts.'],
 ['secretsAllFields','Secrets / credentials','No keys, passwords, tokens, connection strings or internal endpoints.'],
 ['placeholderCorrectness','Placeholder correctness','Types, repeated identities and declared invented renderings must agree.'],
 ['intentActionCorrectness','Intent / action correctness','Check the existing registry; action references use question-stage doAction.'],
 ['entityParameterCorrectness','Parameters / entities','Check every slot, period, null and stated versus missing value.'],
 ['roleScopeCorrectness','Role / scope correctness','Check the declared actor, self/team/company scope and capability restrictions.'],
 ['clarificationUnsupportedBehavior','Clarification / unsupported behavior','Missing information and unsupported filters must not produce a misleading executable answer.'],
 ['confirmationNoExecutionBoundary','Confirmation behavior','Check protected proposals versus safe UI exceptions; annotations never authorize execution.'],
 ['symbolicWireConsistency','Symbolic / wire-plan consistency','Compare both complete representations and the declared renderings.'],
 ['semanticCorrectness','Semantic correctness','Does the whole target answer exactly this request without contradiction or invented facts?'],
 ['lineageIndependence','Independence / lineage concerns','Review construction lineage; protected final-benchmark comparisons belong to the sealed custodian.'],
 ['sourceRights','Source / rights declaration','Check documented synthetic origin and permitted use; flag uncertainty.'],
 ['overallAdmissionSuitability','Overall admission suitability','Record your human assessment. This criterion does not grant final admission.'],
].map(([id,label,help])=>Object.freeze({id,label,help})))
export const CHOICES=Object.freeze(['PASS','FAIL','NOT_APPLICABLE'])
export const TOOL_VERSION='CEB-HUMAN-REVIEW-1'

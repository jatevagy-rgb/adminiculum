# Security evolution filter

Every recovery candidate must pass:

- exact object/case authorization;
- workforce versus portal/customer separation;
- exact issuer/subject identity matching and fail-closed partial configuration;
- safe DTO shaping and safe provider-error mapping;
- upload type/size/content validation and scanner boundary;
- HR/workforce role restrictions;
- canonical String-ID contracts;
- no synthetic identity creation or mutation;
- no production configuration inferred from code.

## Classifications

- `SAFE_SEMANTIC_REPLAY`: contextual UI/read-model/document semantics that can call current services.
- `NEEDS_SECURITY_REWRITE`: old implementation has value but predates current authorization/DTO/scanner rules.
- `DO_NOT_RECOVER`: mock portal, unsafe identity behavior, obsolete browser-editor save model, old storage lifecycle that contradicts current architecture.

No historical branch should be cherry-picked without revalidating this filter.

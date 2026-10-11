## MODIFIED Requirements

### Requirement: committed matching rules

The corporate-action-watch module SHALL load `src/analysis/modules/corporate-action-watch/data/corporate-action-watch-rules.v1.json` and SHALL fail to load when it is invalid. The file SHALL hold exactly:

- `schemaVersion: 1`;
- `cedearProgramIssuers`: a non-empty list of distinct `emisor` names of CEDEAR program issuers;
- `stockIssuerCodes`: a map from a stock line's symbol to the `especie` its issuer publishes under, for symbols that differ from it;
- `cedearNameAliases`: a map from a name used in titles instead of a ticker to the CEDEAR symbol it stands for;
- `eventPhrases`: a non-empty list of distinct, lowercase event phrases;
- `excludedTitlePrefixes`: a list of title prefixes whose notices are never kept.

Symbols, issuer codes and alias targets SHALL be BYMA symbols: uppercase letters, digits and dots, such as `BA.C`. No string SHALL be empty or have leading or trailing spaces.

The committed rules SHALL name the program issuers `BANCO COMAFI S.A.`, `Caja de Valores S.A.` and `BANCO MACRO S.A.`; the issuer codes `TECO2` → `TECO`, `TGSU2` → `TGSU`, `TGNO4` → `TGNO` and `SUPV` → `GSUP`; the name alias `HUT 8 CORP.` → `HUT`; the phrases `stock split`, `reverse stock split`, `cambio de ratio`, `dividendo en acciones`, `dividendos en acciones`, `aviso de pago de capitalizaciones`, `stock dividend` and `dividendo opcional`; and the excluded prefix `Aviso de pago de servicios o renta de Cedear`. Bare `acciones`, `ratio` and `capitalizaciones` SHALL NOT be phrases: they match "transacciones", "CORPORATION" and capitalizations of interest.

GFVA has no observed issuer code and SHALL NOT be given a guessed one; its notices are not matched.

#### Scenario: the committed rules load

- **WHEN** the committed rules are loaded
- **THEN** they contain the three program issuers, the four issuer codes, the HUT alias, the eight phrases and the excluded prefix

#### Scenario: invalid rules are rejected

- **WHEN** a rules value has an uppercase phrase, a lowercase issuer code, an empty program issuer list, a duplicate phrase or an extra field
- **THEN** validation fails with an issue at that field

# OOXML schemas for `tests/docx-validate.js`

`ooxml.xsd` is Kelk's entry schema: it only imports the official schemas below, so one
`xmllint --schema tests/ooxml-xsd/ooxml.xsd part.xml` validates any XML part of a `.docx` (WordprocessingML, VML,
extended and custom properties, content types, relationships). Every other file here is copied **unchanged** from its
official source; fetched 1405-08-11 (Solar Hijri).

| Folder | Source | Archive SHA-256 |
|---|---|---|
| `transitional/` | ECMA-376 5th edition, Part 4 (Transitional Migration Features, December 2016): <https://ecma-international.org/wp-content/uploads/ECMA-376-4_5th_edition_december_2016.zip> → `OfficeOpenXML-XMLSchema-Transitional.zip` | outer `bd25da1109f73762356596918bf5ff8b74a1331642dba5f1c1d1dfc6bed34ecd`, inner `d34187520749998af306faf1b730e568b0ca6d88ad24638a407c0a9bb4ca04fc` |
| `opc/` | ECMA-376 5th edition, Part 2 (Open Packaging Conventions, December 2021): <https://ecma-international.org/wp-content/uploads/ECMA-376-2_5th_edition_december_2021.zip> → `OpenPackagingConventions-XMLSchema.zip` | outer `1d489dc491168ea1f9e9a59063acc8dd5f02b4ad1d21aa7ec19ba9a58d020c70`, inner `e5a0a7c1f43ac8b8f66d850f48545c2ead09f6d632bb8539fab79962c7fd55df` |
| `w3c/xml.xsd` | <https://www.w3.org/2001/xml.xsd> (the `xml:` namespace: `xml:space` on `w:t`) | `61960fb3131e38022caad5360e2f33a3382578ab3c80cd58bd74320ede61b20c` |

Only the schemas a `.docx` needs are kept: the 20 of the 26 Transitional files reachable from `wml.xsd`,
`vml-main.xsd` and the two document-properties schemas (no SpreadsheetML / PresentationML, no charts beyond what
`wml.xsd` imports), and 2 of the 4 OPC files. `opc-coreProperties.xsd` is left out: it imports the Dublin Core
schemas from dublincore.org, so `docProps/core.xml` is checked for well-formedness only.

Each file's SHA-256 (`sha256sum -c` from this folder):

```
4de4390a26e7e44e682ed98b39872cce2620f807f5b0de421567a43f74526388  transitional/dml-chart.xsd
3fd0586f2637b98bb9886f0e0b67d89e1cc987c2d158cc7deb5f5b9890ced412  transitional/dml-chartDrawing.xsd
809f77f658f71e10f5cfbf99e25c895a23a4e62c81210b59a2fe8c7fb24849d2  transitional/dml-diagram.xsd
5cb76dabd8b97d1e9308a1700b90c20139be4d50792d21a7f09789f5cccd6026  transitional/dml-lockedCanvas.xsd
6978ba7e889070b0c3cb5b546b23e5a6c3516134afc53b87a21f482ca33f3858  transitional/dml-main.xsd
5d389d42befbebd91945d620242347caecd3367f9a3a7cf8d97949507ae1f53c  transitional/dml-picture.xsd
2dbfd4719505bf39b568005994a433997cbeac59cebc9d4867d564c94e9ba03a  transitional/dml-wordprocessingDrawing.xsd
48675c4f82f6b097434d4b7e313635b790257cca58fa90dd0e8f19c9affa18ed  transitional/shared-commonSimpleTypes.xsd
0d103b99a4a8652f8871552a69d42d2a3760ac6a5e3ef02d979c4273257ff6a4  transitional/shared-customXmlSchemaProperties.xsd
9c085407751b9061c1f996f6c39ce58451be22a8d334f09175f0e89e42736285  transitional/shared-documentPropertiesCustom.xsd
bc92e36ccd233722d4c5869bec71ddc7b12e2df56059942cce5a39065cc9c368  transitional/shared-documentPropertiesExtended.xsd
7b5b7413e2c895b1e148e82e292a117d53c7ec65b0696c992edca57b61b4a74b  transitional/shared-documentPropertiesVariantTypes.xsd
132e44dc10f2959e3f585584e5d82e7b2e329691e3010646e497710bd9774152  transitional/shared-math.xsd
12264f3c03d738311cd9237d212f1c07479e70f0cbe1ae725d29b36539aef637  transitional/shared-relationshipReference.xsd
335e9ecd40bb594ec4b916ac8c7b9eead4e16fe1b79f9d4105fdb1c43b66bb1c  transitional/vml-main.xsd
585bedc1313b40888dcc544cb74cd939a105ee674f3b1d3aa1cc6d34f70ff155  transitional/vml-officeDrawing.xsd
133c9f64a5c5d573b78d0a474122b22506d8eadb5e063f67cdbbb8fa2f161d0e  transitional/vml-presentationDrawing.xsd
6bdeb169c3717eb01108853bd9fc5a3750fb1fa5b82abbdd854d49855a40f519  transitional/vml-spreadsheetDrawing.xsd
475dcae1e7d1ea46232db6f8481040c15e53a52a3c256831d3df204212b0e831  transitional/vml-wordprocessingDrawing.xsd
0f7784b36ddc42950e5ff354cd608b83b60e4de39325d5568913f1225365029b  transitional/wml.xsd
49ec1c03440a9b5590e69acdf92b200fe133697de0b05f43a129fb94d1885026  opc/opc-contentTypes.xsd
607ffb6879cf5d5d765bfdfb2548f3f427ea964ddee6d08a15f0dc781749866d  opc/opc-relationships.xsd
61960fb3131e38022caad5360e2f33a3382578ab3c80cd58bd74320ede61b20c  w3c/xml.xsd
```

## Licences

**ECMA-376 schemas** (`transitional/`, `opc/`) — © Ecma International. Distributed under Ecma's default copyright
notice (<https://ecma-international.org/policies/by-ipr/ecma-text-copyright-policy/>), which reads in part:

> COPYRIGHT NOTICE © Ecma International. By obtaining and/or copying this work, you (the licensee) agree that you
> have read, understood, and will comply with the following terms and conditions. This document may be copied,
> published and distributed to others, and certain derivative works of it may be prepared, copied, published, and
> distributed, in whole or in part, provided that the above copyright notice and this Copyright License and
> Disclaimer are included on all such copies and derivative works. […] (iv) works by making use of this
> specification in standard conformant products by implementing (e.g. by copy and paste wholly or partly) the
> functionality therein. However, the content of this document itself may not be modified in any way […]
> This document and the information contained herein is provided on an "AS IS" basis and ECMA INTERNATIONAL
> DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED […].

The files are kept unmodified, as the notice requires.

**`w3c/xml.xsd`** — © World Wide Web Consortium, under the W3C Software and Document License
(<https://www.w3.org/copyright/software-license-2023/>); unmodified.

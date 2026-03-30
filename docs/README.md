# Documentation (canonical)

This **`docs/`** directory is the **canonical** home for reference material: version history, gap analysis, ingest pipeline reference, routing notes, enhancement candidates, and diagrams.

## Setup guides (duplicate tree)

The folder **[`aws-elastic-setup/`](../aws-elastic-setup/)** holds the same **CloudWatch → Elastic** how-to guides under shorter paths for discoverability. When a topic exists in both places, treat the **`docs/`** copy as source of truth and keep them in sync when you edit.

| Canonical (`docs/`)                                                                        | Convenience copy (`aws-elastic-setup/`)                                                                       |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| [GUIDE-CLOUDWATCH-GLUE-SAGEMAKER-ELASTIC.md](./GUIDE-CLOUDWATCH-GLUE-SAGEMAKER-ELASTIC.md) | [guide-cloudwatch-glue-sagemaker-elastic.md](../aws-elastic-setup/guide-cloudwatch-glue-sagemaker-elastic.md) |
| [CLOUDWATCH-TO-INDEX-ROUTING.md](./CLOUDWATCH-TO-INDEX-ROUTING.md)                         | [cloudwatch-to-index-routing.md](../aws-elastic-setup/cloudwatch-to-index-routing.md)                         |

Automated installers and CLI onboarding live under **[`installer/`](../installer/)** (see [`installer/README.md`](../installer/README.md)).

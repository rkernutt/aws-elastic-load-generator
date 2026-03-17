import { rand, randInt, randFloat, randId, randIp, randUUID, randAccount, REGIONS, ACCOUNTS, USER_AGENTS, HTTP_METHODS, HTTP_PATHS, PROTOCOLS } from "../helpers/index.js";

function generateGuardDutyLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isFinding = Math.random() < (er + 0.3);
  const findingTypes = ["UnauthorizedAccess:EC2/SSHBruteForce","UnauthorizedAccess:EC2/RDPBruteForce","Recon:EC2/PortScan","Backdoor:EC2/C&CActivity.B","CryptoCurrency:EC2/BitcoinTool.B!DNS","Trojan:EC2/DNSDataExfiltration","UnauthorizedAccess:IAMUser/ConsoleLoginSuccess.B","Policy:IAMUser/RootCredentialUsage","UnauthorizedAccess:IAMUser/MaliciousIPCaller.Custom","Discovery:S3/TorIPCaller","Impact:S3/MaliciousIPCaller","Exfiltration:S3/MaliciousIPCaller","Stealth:IAMUser/PasswordPolicyChange","UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.OutsideAWS","InitialAccess:IAMUser/AnomalousBehavior","Persistence:IAMUser/AnomalousBehavior","PrivilegeEscalation:IAMUser/AnomalousBehavior"];
  const ft = rand(findingTypes); const sev = isFinding ? rand([2,5,7,8,9]) : 0;
  const findingId = randId(32).toLowerCase();
  const detectorId = randId(32).toLowerCase();
  const instanceId = `i-${randId(17).toLowerCase()}`;
  const isDnsFinding = ft.includes("DNS");
  const isNetworkFinding = ft.includes(":EC2/") || ft.includes("MaliciousIP");
  const srcIp = randIp();
  const dstIp = randIp();
  const threatIndicatorType = isDnsFinding ? "domain" : "ip";
  const threatPurpose = ft.split(":")[0];
  const gdCategory = ["CryptoCurrency","Trojan","Backdoor"].includes(threatPurpose) ? "malware" : ["Recon","PrivilegeEscalation","InitialAccess","Persistence"].includes(threatPurpose) ? "intrusion_detection" : "threat";
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"guardduty" } },
    "aws": {
      dimensions: { DetectorId:detectorId },
      guardduty: {
        schema_version: "2.0",
        account_id: acct.id,
        region,
        partition: "aws",
        id: findingId,
        arn: `arn:aws:guardduty:${region}:${acct.id}:detector/${detectorId}/finding/${findingId}`,
        type: ft,
        title: ft.replace(/^[^:]+:/,"").replace(/[/.!]/g," "),
        description: isFinding ? `GuardDuty detected suspicious activity: ${ft}` : "Routine check completed.",
        created_at: ts,
        updated_at: ts,
        severity: sev,
        confidence: parseFloat(randFloat(60,99)),
        finding_id: findingId,
        finding_type: ft,
        detector_id: detectorId,
        resource_type: rand(["Instance","AccessKey","S3Bucket","EKSCluster"]),
        action_type: rand(["NETWORK_CONNECTION","PORT_PROBE","DNS_REQUEST","AWS_API_CALL"]),
        count: randInt(1,500),
        resource: isFinding ? {
          instance_details: {
            availability_zone: `${region}${rand(["a","b","c"])}`,
            instance: { id:instanceId, type:rand(["t3.medium","m5.large"]), state:"running" },
            image: { id:`ami-${randId(8).toLowerCase()}`, description:"Amazon Linux 2" },
            network_interfaces: [{ network_interface_id:`eni-${randId(8).toLowerCase()}`, private_ip_address:randIp(), subnet_id:`subnet-${randId(8).toLowerCase()}`, vpc_id:`vpc-${randId(8).toLowerCase()}`, security_groups:[{ group_id:`sg-${randId(8).toLowerCase()}`, group_name:"default" }] }],
          }
        } : undefined,
        service: isFinding ? { action: { action_type: rand(["NETWORK_CONNECTION","PORT_PROBE","DNS_REQUEST","AWS_API_CALL"]) } } : undefined,
        metrics: {
          FindingCount: { sum: isFinding ? randInt(1,50) : 0 },
          HighSeverityFindingCount: { sum: isFinding&&sev>=7 ? randInt(1,10) : 0 },
          MediumSeverityFindingCount: { sum: isFinding&&sev>=4&&sev<7 ? randInt(1,20) : 0 },
          LowSeverityFindingCount: { sum: isFinding&&sev<4 ? randInt(1,30) : 0 },
        }
      }
    },
    "threat": { indicator:[{ type:threatIndicatorType, value:isDnsFinding?`suspicious-${randId(8).toLowerCase()}.example.com`:srcIp }] },
    ...(isFinding && isNetworkFinding ? { "source": { ip:srcIp, geo:{ country_iso_code:rand(["US","GB","DE","FR","JP","AU","CA","IN"]), city_name:rand(["Ashburn","London","Frankfurt","Tokyo","Sydney","Toronto"]) } }, "destination": { ip:dstIp } } : {}),
    "event": { kind:"alert", severity:sev, outcome:isFinding?"failure":"success", category:[gdCategory], type:["indicator"], dataset:"aws.guardduty", provider:"guardduty.amazonaws.com" },
    "message": isFinding ? `GuardDuty finding [Severity ${sev}]: ${ft}` : `GuardDuty: no threats detected`,
    "log": { level:sev>=7?"error":sev>=4?"warn":"info" },
    ...(isFinding ? { error: { code: "ThreatFinding", message: `GuardDuty finding: ${ft}`, type: "security" } } : {})
  };
}

function generateSecurityHubLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isFinding = Math.random() < (er + 0.25);
  const standardsFull = ["AWS Foundational Security Best Practices v1.0.0","CIS AWS Foundations Benchmark v1.2.0","CIS AWS Foundations Benchmark v1.4.0","NIST SP 800-53 Rev. 5","PCI DSS v3.2.1","SOC 2 Type II"];
  const standardsSlug = ["aws-foundational-security-best-practices","cis-aws-foundations-benchmark","pci-dss"];
  const sev = isFinding ? rand(["CRITICAL","HIGH","MEDIUM","LOW","INFORMATIONAL"]) : "INFORMATIONAL";
  const isCIS = Math.random() > 0.5;
  const controlId = isCIS ? rand(["CIS.1.1","CIS.1.2","CIS.1.3","CIS.1.4","CIS.2.1","CIS.2.2","CIS.2.7","CIS.3.1","CIS.3.2","CIS.3.3"]) : rand(["IAM.1","IAM.2","IAM.3","S3.1","S3.2","S3.3","EC2.1","EC2.2","Lambda.1","Lambda.2","RDS.1","CloudTrail.1","CloudTrail.2"]);
  const findingId = `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`;
  const findingType = rand(["Software and Configuration Checks/AWS Security Best Practices","Software and Configuration Checks/Industry and Regulatory Standards/CIS AWS Foundations Benchmark","Threat Detections/Tactics/Impact","Effects/Data Exposure","Software and Configuration Checks/Vulnerabilities/CVE"]);
  const createdTs = new Date(Date.parse(ts) - randInt(0, 86400000)).toISOString();
  const shCategory = findingType.startsWith("Threat") ? "vulnerability" : findingType.startsWith("Effects") ? "vulnerability" : "compliance";
  const shEventType = isFinding ? ["indicator"] : ["info"];
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"securityhub" } },
    "aws": {
      dimensions: { ComplianceStandard:rand(standardsSlug), ControlId:controlId },
      securityhub_findings: {
        id: findingId,
        aws_account_id: acct.id,
        description: isFinding ? `Security check failed: ${controlId} - ${rand(["MFA not enabled for root","S3 bucket is publicly accessible","Default security group allows all traffic"])}` : "Control passed.",
        created_at: createdTs,
        first_observed_at: createdTs,
        last_observed_at: ts,
        generator: { id: controlId },
        types: [findingType],
        compliance: { security_control_id: controlId, status: isFinding ? "FAILED" : "PASSED" },
        criticality: sev === "CRITICAL" ? 9 : sev === "HIGH" ? 7 : 4,
        confidence: randInt(70, 99),
      },
      securityhub: {
        finding_id: `arn:aws:securityhub:${region}:${acct.id}:finding/${findingId}`,
        standard: rand(standardsFull),
        control_id: controlId,
        compliance_status: isFinding?"FAILED":"PASSED",
        severity_label: sev,
        workflow_status: rand(["NEW","NOTIFIED","RESOLVED","SUPPRESSED"]),
        account_id: acct.id,
        metrics: {
          Findings: { sum: isFinding ? randInt(1,100) : 0 },
          FailedChecks: { sum: isFinding ? randInt(1,50) : 0 },
          PassedChecks: { sum: isFinding ? 0 : randInt(50,200) },
        }
      }
    },
    "event": { kind:"alert", severity:sev==="CRITICAL"?9:sev==="HIGH"?7:4, outcome:isFinding?"failure":"success", category:[shCategory], type:shEventType, dataset:"aws.securityhub_findings", provider:"securityhub.amazonaws.com" },
    "message": isFinding ? `Security Hub [${sev}]: Compliance check failed` : `Security Hub: control passed`,
    "log": { level:sev==="CRITICAL"?"error":sev==="HIGH"?"warn":"info" },
    ...(isFinding ? { error: { code: "ComplianceFailed", message: `Control ${controlId} failed`, type: "compliance" } } : {})
  };
}

function generateMacieLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isFinding = Math.random() < (er + 0.2);
  const dataTypes = ["SensitiveData:S3Object/Credentials","SensitiveData:S3Object/Financial","SensitiveData:S3Object/Personal","SensitiveData:S3Object/Multiple","Policy:IAMUser/S3BucketPublic","Policy:IAMUser/S3BucketReplicatedExternally","Policy:IAMUser/S3BucketSharedExternally","Policy:IAMUser/S3BucketSharedWithCloudFront"];
  const bucket = rand(["prod-data","raw-uploads","customer-exports","analytics-output","backup-bucket"]);
  const bucketName = `${bucket}-${region}`;
  const findingType = isFinding ? rand(dataTypes) : "none";
  const dataIdentifier = rand(["AWS_CREDENTIALS","CREDIT_CARD_NUMBER","DRIVER_LICENSE_US","EMAIL_ADDRESS","FINANCIAL_INFORMATION","HIPAA","IP_ADDRESS","NAME","PASSPORT_NUMBER","PHONE_NUMBER","SSN_US","TIN_US"]);
  const isPolicyFinding = findingType.startsWith("Policy:");
  const macieCategory = isPolicyFinding ? "intrusion_detection" : findingType.includes("Credentials") ? "malware" : "vulnerability";
  const ownerId = randId(64).toLowerCase();
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"macie" } },
    "aws": {
      dimensions: { BucketName:bucketName },
      macie: {
        finding_id: `${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase(),
        finding_type: findingType,
        severity: isFinding?rand(["HIGH","MEDIUM","LOW"]):"INFORMATIONAL",
        s3_bucket: { name:bucketName, arn:`arn:aws:s3:::${bucketName}` },
        s3_bucket_full: {
          name: bucketName,
          arn: `arn:aws:s3:::${bucketName}`,
          owner_id: ownerId,
          default_server_side_encryption: { encryption_type: rand(["AES256","aws:kms","NONE"]) },
          tags: [{ key:"Environment", value:rand(["prod","staging","dev"]) }],
          public_access: { effective_permission: isPolicyFinding?"PUBLIC":"NOT_PUBLIC", block_public_acls:!isPolicyFinding, block_public_policy:!isPolicyFinding, ignore_public_acls:!isPolicyFinding, restrict_public_buckets:!isPolicyFinding }
        },
        occurrences: isFinding?randInt(1,50000):0,
        sensitive_data_categories: isFinding?[rand(["PII","FINANCIAL","CREDENTIALS","MEDICAL"])]:[],
        data_identifiers: isFinding ? [dataIdentifier] : [],
      }
    },
    "event": { kind:"alert", outcome:isFinding?"failure":"success", category:[macieCategory], dataset:"aws.macie", provider:"macie2.amazonaws.com" },
    "message": isFinding ? `Macie detected sensitive data in s3://${bucketName}: ${findingType}` : `Macie scan complete: no sensitive data found`,
    "log": { level:isFinding?"warn":"info" },
    ...(isFinding ? { error: { code: "SensitiveDataFound", message: `Sensitive data in s3://${bucketName}`, type: "data" } } : {})
  };
}

function generateInspectorLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isFinding = Math.random() < (er + 0.35);
  const sev = isFinding ? rand(["CRITICAL","HIGH","MEDIUM","LOW","INFORMATIONAL"]) : "INFORMATIONAL";
  const pkgs = ["openssl","log4j","libssl","python3","java-11","nodejs","curl"];
  const cveYear = randInt(2020,2024); const cveNum = randInt(1000,99999);
  const cveId = `CVE-${cveYear}-${cveNum}`;
  const findingType = isFinding ? rand(["PACKAGE_VULNERABILITY","NETWORK_REACHABILITY","CODE_VULNERABILITY"]) : "NONE";
  const pkgName = rand(pkgs);
  const pkgVersion = `${randInt(1,3)}.${randInt(0,20)}.${randInt(0,50)}`;
  const fixVersion = `${randInt(1,3)}.${randInt(0,20)}.${randInt(0,50)+1}`;
  const fixAvailable = Math.random()>0.3?"YES":"NO";
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"inspector" } },
    "aws": {
      dimensions: { ResourceType:rand(["AWS_EC2_INSTANCE","AWS_ECR_CONTAINER_IMAGE","AWS_LAMBDA_FUNCTION"]) },
      inspector: {
        finding_id: `arn:aws:inspector2:${region}:${acct.id}:finding/${randId(8)}-${randId(4)}`,
        finding_type: findingType,
        severity: sev, inspector_score: isFinding?parseFloat(randFloat(4,10)):0,
        vulnerable_package: { name:pkgName, version:pkgVersion },
        affected_packages: isFinding ? [{ name:pkgName, version:pkgVersion, fix_available:fixAvailable, remediation:`Update to ${fixVersion}` }] : [],
        cve_id: isFinding ? cveId : null,
        resource_type: rand(["AWS_EC2_INSTANCE","AWS_ECR_CONTAINER_IMAGE","AWS_LAMBDA_FUNCTION"]),
        metrics: {
          TotalFindings: { sum: isFinding ? randInt(1,20) : 0 },
          CriticalFindings: { sum: isFinding&&sev==="CRITICAL" ? randInt(1,5) : 0 },
          HighFindings: { sum: isFinding&&sev==="HIGH" ? randInt(1,10) : 0 },
        }
      }
    },
    "vulnerability": { id:isFinding?cveId:null, severity:sev, score:{ base: isFinding?parseFloat(parseFloat(randFloat(1,10)).toFixed(1)):0 } },
    "event": { kind:"alert", outcome:isFinding?"failure":"success", category:["vulnerability","package"], dataset:"aws.inspector", provider:"inspector2.amazonaws.com" },
    "message": isFinding ? `Inspector [${sev}]: ${cveId} found in ${pkgName}` : `Inspector scan: no vulnerabilities found`,
    "log": { level:sev==="CRITICAL"?"error":sev==="HIGH"?"warn":"info" },
    ...(isFinding ? { error: { code: "VulnerabilityFound", message: `CVE found: ${cveId}`, type: "vulnerability" } } : {})
  };
}

function generateConfigLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isNonCompliant = Math.random() < (er + 0.2);
  const rules = ["s3-bucket-public-read-prohibited","s3-bucket-ssl-requests-only","iam-root-access-key-check","iam-user-mfa-enabled","ec2-instance-no-public-ip","restricted-ssh","restricted-common-ports","vpc-flow-logs-enabled","cloudtrail-enabled","cloud-trail-encryption-enabled","root-account-mfa-enabled","access-keys-rotated","iam-password-policy","ec2-stopped-instance","eip-attached"];
  const resources = ["AWS::EC2::Instance","AWS::S3::Bucket","AWS::IAM::User","AWS::RDS::DBInstance","AWS::EC2::SecurityGroup"];
  const rule = rand(rules); const resource = rand(resources);
  const complianceStatus = rand(["COMPLIANT","NON_COMPLIANT","NOT_APPLICABLE","INSUFFICIENT_DATA"]);
  const isNonCompliantFinal = complianceStatus === "NON_COMPLIANT" || (isNonCompliant && complianceStatus !== "COMPLIANT");
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"config" } },
    "aws": {
      dimensions: { ConfigRuleName:rule, ResourceType:resource },
      config: {
        rule_name: rule, compliance_type: complianceStatus,
        resource_type: resource,
        resource_id: `${rand(["i","sg","s3","db"])}-${randId(8).toLowerCase()}`,
        annotation: isNonCompliantFinal?rand(["Resource is not compliant","Missing required tag","Encryption not enabled","Public access enabled"]):"Resource is compliant",
        metrics: {
          ComplianceByConfigRule: { avg: isNonCompliantFinal ? 0 : 1 },
          NonCompliantRules: { sum: isNonCompliantFinal ? 1 : 0 },
          CompliantRules: { sum: isNonCompliantFinal ? 0 : 1 },
          ConfigurationItemsRecorded: { sum: randInt(1,100) },
        }
      }
    },
    "event": { outcome:isNonCompliantFinal?"failure":"success", category:["configuration","compliance"], dataset:"aws.config", provider:"config.amazonaws.com" },
    "message": isNonCompliantFinal ? `Config rule FAILED: ${rule}` : `Config rule PASSED: ${rule}`,
    "log": { level:isNonCompliantFinal?"warn":"info" },
    ...(isNonCompliantFinal ? { error: { code: "NonCompliant", message: `Config rule ${rule} failed`, type: "compliance" } } : {})
  };
}

function generateAccessAnalyzerLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isFinding = Math.random() < (er + 0.15);
  const resourceTypes = ["AWS::S3::Bucket","AWS::IAM::Role","AWS::KMS::Key","AWS::Lambda::Function","AWS::SQS::Queue"];
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"access-analyzer" } },
    "aws": {
      dimensions: { AnalyzerName:`analyzer-${region}` },
      access_analyzer: {
        finding_id: `${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase(),
        analyzer_name: `analyzer-${region}`,
        finding_type: isFinding?rand(["EXTERNAL_ACCESS","UNUSED_ACCESS"]):"none",
        finding_description: isFinding?rand(["Policy allows external access","Cross-account access","Internet-accessible resource","Unused IAM role","Unused IAM user","Unused access key"]):"No external access",
        resource_type: rand(resourceTypes),
        resource_arn: `arn:aws:s3:::${rand(["prod","staging","dev"])}-bucket`,
        principal: isFinding?"*":null,
        status: isFinding?rand(["ACTIVE","ARCHIVED"]):"RESOLVED"
      }
    },
    "event": { kind:isFinding?"alert":"event", outcome:isFinding?"failure":"success", category:["configuration","iam"], dataset:"aws.access_analyzer", provider:"access-analyzer.amazonaws.com" },
    "message": isFinding ? `IAM Access Analyzer: external access found on ${rand(resourceTypes)}` : `Access Analyzer: no external access paths detected`,
    "log": { level:isFinding?"warn":"info" },
    ...(isFinding ? { error: { code: "ExternalAccess", message: "External access path detected", type: "access" } } : {})
  };
}

function generateCognitoLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const pool = rand(["us-users","eu-users","mobile-users","b2b-customers"]);
  const action = rand(["SignIn","SignUp","ForgotPassword","ConfirmSignUp","TokenRefresh","AdminCreateUser","SignIn","SignIn"]);
  const user = `user-${randId(8).toLowerCase()}@example.com`;
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"cognito"}},
    "aws":{cognito:{user_pool_id:`${region}_${randId(9)}`,user_pool_name:pool,
      event_type:action,username:isErr?null:user,
      error_code:isErr?rand(["NotAuthorizedException","UserNotFoundException","TooManyRequestsException"]):null,
      source_ip:randIp(),mfa_type:Math.random()>0.7?rand(["SOFTWARE_TOKEN_MFA","SMS_MFA"]):null}},
    "user":{name:isErr?null:user},"source":{ip:randIp()},
    "event":{action,outcome:isErr?"failure":"success",category:"authentication",dataset:"aws.cognito",provider:"cognito-idp.amazonaws.com"},
    "message":isErr?`Cognito ${action} FAILED: ${rand(["Incorrect password","User not found","Rate limit exceeded"])}`:
      `Cognito ${action} success [${pool}]`,
    "log":{level:isErr?"warn":"info"},
    ...(isErr ? { error: { code: rand(["NotAuthorizedException","UserNotFoundException","TooManyRequestsException"]), message: "Authentication failed", type: "authentication" } } : {})};
}

function generateKmsLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const keyId = `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
  const op = rand(["Decrypt","Encrypt","GenerateDataKey","Sign","Verify","DescribeKey","EnableKeyRotation","ScheduleKeyDeletion"]);
  const keyAlias = rand(["alias/prod-s3-key","alias/rds-encryption","alias/backup-key","alias/secrets-key"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"kms"}},
    "aws":{kms:{key_id:keyId,key_alias:keyAlias,operation:op,
      principal_arn:`arn:aws:iam::${acct.id}:${rand(["user/alice","role/lambda-role","role/ecs-task-role"])}`,
      key_state:isErr?"PendingDeletion":"Enabled",
      encryption_algorithm:rand(["SYMMETRIC_DEFAULT","RSAES_OAEP_SHA_256"]),
      error_code:isErr?rand(["DisabledException","AccessDeniedException","KMSInvalidStateException"]):null,
      metrics:{ SecretsManagerCrossAccountBlocking:{ sum:0 }, KeysCount:{ avg:randInt(1,1000) }, KeysPendingDeletion:{ avg:randInt(0,10) }, KeysDisabled:{ avg:randInt(0,5) } }}},
    "event":{action:op,outcome:isErr?"failure":"success",category:["authentication","configuration"],dataset:"aws.kms",provider:"kms.amazonaws.com"},
    "message":isErr?`KMS ${op} FAILED on ${keyAlias}: ${rand(["Key disabled","Access denied","Key pending deletion"])}`:
      `KMS ${op}: ${keyAlias}`,
    "log":{level:isErr?"error":"info"},
    ...(isErr ? { error: { code: rand(["DisabledException","AccessDeniedException","KMSInvalidStateException"]), message: "KMS operation failed", type: "access" } } : {})};
}

function generateSecretsManagerLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const secret = rand(["prod/db/password","prod/api/key","staging/redis/auth","prod/oauth/secret","prod/stripe/api-key"]);
  const op = rand(["GetSecretValue","PutSecretValue","RotateSecret","CreateSecret","DeleteSecret","GetSecretValue","GetSecretValue"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"secretsmanager"}},
    "aws":{secretsmanager:{secret_name:secret,operation:op,
      rotation_enabled:op==="RotateSecret",
      accessed_by:rand(["lambda-function","ecs-task","ec2-instance","developer"]),
      last_rotated_date:new Date(Date.now()-randInt(0,30)*86400000).toISOString(),
      error_code:isErr?rand(["DecryptionFailure","EncryptionFailure","InternalServiceError","InvalidNextTokenException","InvalidParameterException","InvalidRequestException","LimitExceededException","MalformedPolicyDocumentException","PreconditionsFailedException","PublicPolicyException","ResourceExistsException","ResourceNotFoundException"]):null}},
    "event":{action:op,outcome:isErr?"failure":"success",category:["authentication","configuration"],dataset:"aws.secretsmanager",provider:"secretsmanager.amazonaws.com"},
    "message":isErr?`Secrets Manager ${op} on ${secret} FAILED: ${rand(["Access denied","Secret not found"])}`:
      `Secrets Manager ${op}: ${secret}`,
    "log":{level:isErr?"error":"info"},
    ...(isErr ? { error: { code: rand(["DecryptionFailure","EncryptionFailure","InternalServiceError","InvalidNextTokenException","InvalidParameterException","InvalidRequestException","LimitExceededException","MalformedPolicyDocumentException","PreconditionsFailedException","PublicPolicyException","ResourceExistsException","ResourceNotFoundException"]), message: "Secrets Manager operation failed", type: "access" } } : {})};
}

function generateAcmLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const domain = rand(["*.example.com","api.example.com","www.example.com","*.internal.corp"]);
  const status = isErr ? rand(["FAILED","REVOKED","EXPIRED"]) : rand(["ISSUED","ISSUED","PENDING_VALIDATION"]);
  const daysToExpiry = isErr ? randInt(-30,30) : randInt(30,365);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"acm"}},
    "aws":{acm:{
      certificate_arn:`arn:aws:acm:${region}:${acct.id}:certificate/${randId(8)}-${randId(4)}`.toLowerCase(),
      domain_name:domain,status,type:rand(["AMAZON_ISSUED","IMPORTED"]),
      days_to_expiry:daysToExpiry,key_algorithm:rand(["RSA_2048","EC_prime256v1"]),
      validation_method:rand(["DNS","EMAIL"]),
      renewal_status:isErr?"FAILED":"SUCCESS"}},
    "event":{outcome:isErr?"failure":"success",category:"network",dataset:"aws.acm",provider:"acm.amazonaws.com"},
    "message":isErr?`ACM certificate for ${domain}: ${status}${daysToExpiry<0?` (expired ${Math.abs(daysToExpiry)}d ago)`:""}`:
      `ACM certificate for ${domain}: ${status}, ${daysToExpiry}d remaining`,
    "log":{level:isErr?"error":daysToExpiry<30?"warn":"info"},
    ...(isErr ? { error: { code: status, message: `Certificate ${domain}: ${status}`, type: "certificate" } } : {})};
}

function generateIamIdentityCenterLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const user = rand(["alice@corp.com","bob@corp.com","carol@corp.com","svc-account@corp.com"]);
  const action = rand(["Authenticate","Authorize","ProvisionUser","AssignPermissionSet","RevokeAccess","MFAChallenge"]);
  const app = rand(["AWS Console","Salesforce","Slack","GitHub Enterprise","Jira","DataDog"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"identitycenter"}},
    "aws":{iam_identity_center:{event_type:action,user_name:user,application_name:app,
      permission_set:rand(["AdministratorAccess","ReadOnlyAccess","PowerUserAccess","BillingAccess"]),
      account_id:`${acct.id}`,
      error_code:isErr?rand(["AccessDeniedException","MFARequired"]):null,
      mfa_authenticated:Math.random()>0.2}},
    "user":{name:user},"source":{ip:randIp()},
    "event":{action,outcome:isErr?"failure":"success",category:"authentication",dataset:"aws.identitycenter",provider:"sso.amazonaws.com"},
    "message":isErr?`IAM Identity Center ${action} FAILED for ${user} on ${app}`:
      `IAM Identity Center ${action}: ${user} -> ${app}`,
    "log":{level:isErr?"warn":"info"},
    ...(isErr ? { error: { code: rand(["AccessDeniedException","MFARequired"]), message: "SSO authentication failed", type: "authentication" } } : {})};
}

function generateDetectiveLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isFinding = Math.random() < (er + 0.2);
  const behavior = rand(["Impossible Travel","New ASN","Unusual API Calls","Credential Compromise","Lateral Movement","Data Exfiltration","Brute Force"]);
  const sev = isFinding ? rand(["CRITICAL","HIGH","MEDIUM"]) : "LOW";
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"detective"}},
    "aws":{detective:{entity_type:rand(["AwsAccount","AwsIamRole","AwsIamUser","Ec2Instance"]),
      entity_id:rand([`arn:aws:iam::${acct.id}:user/suspicious`,`i-${randId(17).toLowerCase()}`]),
      behavior_type:isFinding?behavior:"Normal",
      severity_score:isFinding?parseFloat(randFloat(50,99)):parseFloat(randFloat(0,30)),
      finding_count:isFinding?randInt(1,20):0}},
    "event":{kind:isFinding?"alert":"event",outcome:isFinding?"failure":"success",category:"intrusion_detection",dataset:"aws.detective",provider:"detective.amazonaws.com"},
    "message":isFinding?`Detective [${sev}]: ${behavior} detected - ${randInt(1,20)} related findings`:
      `Detective: entity behavior within normal baseline`,
    "log":{level:sev==="CRITICAL"?"error":sev==="HIGH"?"warn":"info"},
    ...(isFinding ? { error: { code: "AnomalousBehavior", message: `${behavior} detected`, type: "security" } } : {})};
}

function generateCloudTrailLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const user = rand(["alice","bob","carol","deploy-bot","ci-pipeline","admin"]);
  const svcDistribution = rand(["ec2","ec2","ec2","s3","s3","iam","iam","lambda","sts"]);
  const ec2Events = rand(["RunInstances","TerminateInstances","StopInstances","StartInstances","DescribeInstances","CreateSecurityGroup","AuthorizeSecurityGroupIngress","ModifyInstanceAttribute"]);
  const s3Events = rand(["CreateBucket","DeleteBucket","PutBucketPolicy","GetBucketAcl","PutObject","GetObject","DeleteObject","ListBuckets"]);
  const iamEvents = rand(["CreateUser","DeleteUser","AttachUserPolicy","DetachUserPolicy","CreateRole","CreatePolicy","AssumeRole","UpdateRole","ListUsers","GetUser","ConsoleLogin"]);
  const lambdaEvents = rand(["CreateFunction20150331","UpdateFunctionCode20150331v2","InvokeFunction","DeleteFunction20150331","ListFunctions20150331"]);
  const svcMap = {
    ec2: { name: ec2Events, svc: "ec2.amazonaws.com" },
    s3: { name: s3Events, svc: "s3.amazonaws.com" },
    iam: { name: iamEvents, svc: iamEvents === "AssumeRole" || iamEvents === "ConsoleLogin" ? "sts.amazonaws.com" : "iam.amazonaws.com" },
    lambda: { name: lambdaEvents, svc: "lambda.amazonaws.com" },
    sts: { name: "AssumeRole", svc: "sts.amazonaws.com" },
  };
  const ev = svcMap[svcDistribution];
  const eventName = ev.name;
  const sourceIPAddress = randIp();
  const userAgent = rand(USER_AGENTS);
  const requestId = randId(8) + "-" + randId(4) + "-" + randId(4) + "-" + randId(4) + "-" + randId(12);
  const eventType = eventName === "ConsoleLogin" ? "AwsConsoleSignIn" : "AwsApiCall";
  const readOnly = ["DescribeInstances","GetObject","ListBuckets","GetBucketAcl","ListUsers","GetUser","ListFunctions20150331"].includes(eventName);
  const ctErrorCodes = ["AccessDenied","AccessDeniedException","AuthFailure","InvalidClientTokenId","OptInRequired","RequestExpired","ServiceUnavailable","Throttling","UnauthorizedOperation","ValidationError","MalformedPolicyDocumentException","EntityAlreadyExistsException","NoSuchEntityException","LimitExceededException","InvalidInputException","DeleteConflictException"];
  const errorCode = isErr ? rand(ctErrorCodes) : undefined;
  const isAuthEvent = ["ConsoleLogin","AssumeRole"].includes(eventName);
  const isIamEvent = ["CreateUser","DeleteUser","AttachUserPolicy","DetachUserPolicy","CreateRole","CreatePolicy","UpdateRole"].includes(eventName);
  const eventCategory = isAuthEvent ? ["authentication","iam"] : isIamEvent ? ["iam"] : ["configuration"];
  const eventTypeMap = {
    RunInstances: ["creation"], TerminateInstances: ["deletion"], StopInstances: ["change"], StartInstances: ["change"],
    DescribeInstances: ["access","info"], CreateSecurityGroup: ["creation"], AuthorizeSecurityGroupIngress: ["change"],
    ModifyInstanceAttribute: ["change"], CreateBucket: ["creation"], DeleteBucket: ["deletion"], PutBucketPolicy: ["change"],
    GetBucketAcl: ["access","info"], PutObject: ["creation"], GetObject: ["access"], DeleteObject: ["deletion"],
    ListBuckets: ["access","info"], CreateUser: ["creation"], DeleteUser: ["deletion"], AttachUserPolicy: ["change"],
    DetachUserPolicy: ["change"], CreateRole: ["creation"], CreatePolicy: ["creation"], AssumeRole: ["access"],
    UpdateRole: ["change"], ListUsers: ["access","info"], GetUser: ["access","info"], ConsoleLogin: ["authentication","info"],
    "CreateFunction20150331": ["creation"], "UpdateFunctionCode20150331v2": ["change"], InvokeFunction: ["access"],
    "DeleteFunction20150331": ["deletion"], "ListFunctions20150331": ["access","info"],
  };
  const evType = eventTypeMap[eventName] || ["info"];
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"cloudtrail" } },
    "aws": {
      dimensions: { EventName:eventName, EventSource:ev.svc },
      cloudtrail: {
        event_version: "1.08",
        event_id: `${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase(),
        event_name: eventName,
        event_source: ev.svc,
        event_category: eventName === "ConsoleLogin" ? "SignIn" : "Management",
        event_type: eventType,
        request_id: requestId,
        api_version: "2012-10-17",
        management_event: true,
        read_only: readOnly,
        source_ip_address: sourceIPAddress,
        user_agent: userAgent,
        user_identity: { type:"IAMUser", user_name:user, account_id:acct.id },
        request_parameters: isErr ? undefined : (eventName === "CreateBucket" ? { bucketName:`my-bucket-${randId(6).toLowerCase()}` } : eventName === "PutObject" ? { bucketName:"prod-data", key:"uploads/file.json" } : {}),
        response_elements: isErr ? { errorCode } : {},
        error_code: errorCode,
        error_message: isErr ? "User is not authorized to perform this operation" : undefined,
      }
    },
    "user": { name:user },
    "source": { ip:sourceIPAddress, geo:{ country_iso_code:rand(["US","GB","DE","FR","JP","AU","CA","IN"]), city_name:rand(["Ashburn","London","Frankfurt","Tokyo","Sydney","Toronto"]) } },
    "user_agent": { original: userAgent },
    "event": { action:eventName, outcome:isErr?"failure":"success", category:eventCategory, type:evType, dataset:"aws.cloudtrail", provider:"cloudtrail.amazonaws.com" },
    "message": `CloudTrail: ${eventName} by ${user} from ${sourceIPAddress} - ${errorCode||"Success"}`,
    "log": { level:isErr?"warn":"info" },
    ...(isErr ? { error: { code: errorCode, message: "User is not authorized to perform this operation", type: "access" } } : {})
  };
}

export { generateGuardDutyLog, generateSecurityHubLog, generateMacieLog, generateInspectorLog, generateConfigLog, generateAccessAnalyzerLog, generateCognitoLog, generateKmsLog, generateSecretsManagerLog, generateAcmLog, generateIamIdentityCenterLog, generateDetectiveLog, generateCloudTrailLog };

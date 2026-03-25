import { rand, randInt, randFloat, randId, randIp, randUUID, randAccount, REGIONS, ACCOUNTS, USER_AGENTS, HTTP_METHODS, HTTP_PATHS, PROTOCOLS } from "../helpers/index.js";

function generateGuardDutyLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isFinding = Math.random() < (er + 0.3);
  const findingTypes = ["UnauthorizedAccess:EC2/SSHBruteForce","UnauthorizedAccess:EC2/RDPBruteForce","Recon:EC2/PortScan","Backdoor:EC2/C&CActivity.B","CryptoCurrency:EC2/BitcoinTool.B!DNS","Trojan:EC2/DNSDataExfiltration","UnauthorizedAccess:IAMUser/ConsoleLoginSuccess.B","Policy:IAMUser/RootCredentialUsage","UnauthorizedAccess:IAMUser/MaliciousIPCaller.Custom","Discovery:S3/TorIPCaller","Impact:S3/MaliciousIPCaller","Exfiltration:S3/MaliciousIPCaller","Stealth:IAMUser/PasswordPolicyChange","UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.OutsideAWS","InitialAccess:IAMUser/AnomalousBehavior","Persistence:IAMUser/AnomalousBehavior","PrivilegeEscalation:IAMUser/AnomalousBehavior"];
  const ft = rand(findingTypes); const sev = isFinding ? rand([2.0, 4.0, 5.0, 7.0, 8.0]) : 0;
  const sevValue = sev >= 7 ? "High" : sev >= 4 ? "Medium" : sev >= 1 ? "Low" : "Informational";
  const findingId = randId(32).toLowerCase();
  const detectorId = randId(32).toLowerCase();
  const instanceId = `i-${randId(17).toLowerCase()}`;
  const isDnsFinding = ft.includes("DNS");
  const isNetworkFinding = ft.includes(":EC2/") || ft.includes("MaliciousIP");
  const srcIp = randIp();
  const dstIp = randIp();
  const srcGeo = rand([
    { country_iso_code:"CN", country_name:"China",         city_name:"Beijing",      location:{ lat:39.9042, lon:116.4074  } },
    { country_iso_code:"RU", country_name:"Russia",        city_name:"Moscow",       location:{ lat:55.7558, lon:37.6173   } },
    { country_iso_code:"IR", country_name:"Iran",          city_name:"Tehran",       location:{ lat:35.6892, lon:51.3890   } },
    { country_iso_code:"KP", country_name:"North Korea",   city_name:"Pyongyang",    location:{ lat:39.0194, lon:125.7381  } },
    { country_iso_code:"US", country_name:"United States", city_name:"Ashburn",      location:{ lat:39.0438, lon:-77.4874  } },
    { country_iso_code:"GB", country_name:"United Kingdom",city_name:"London",       location:{ lat:51.5074, lon:-0.1278   } },
    { country_iso_code:"DE", country_name:"Germany",       city_name:"Frankfurt",    location:{ lat:50.1109, lon:8.6821    } },
    { country_iso_code:"IN", country_name:"India",         city_name:"Mumbai",       location:{ lat:19.0760, lon:72.8777   } },
  ]);
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
        severity: { code: sev, value: sevValue },
        confidence: parseFloat(randFloat(60,99)),
        resource: {
          type: rand(["Instance","AccessKey","S3Bucket","EKSCluster"]),
          ...(isFinding ? {
            instance_details: {
              availability_zone: `${region}${rand(["a","b","c"])}`,
              instance: { id:instanceId, type:rand(["t3.medium","m5.large"]), state:"running" },
              image: { id:`ami-${randId(8).toLowerCase()}`, description:"Amazon Linux 2" },
              network_interfaces: [{ network_interface_id:`eni-${randId(8).toLowerCase()}`, private_ip_address:randIp(), subnet_id:`subnet-${randId(8).toLowerCase()}`, vpc_id:`vpc-${randId(8).toLowerCase()}`, security_groups:[{ group_id:`sg-${randId(8).toLowerCase()}`, group_name:"default" }] }],
            }
          } : {})
        },
        service: {
          detector_id: detectorId,
          count: randInt(1,500),
          archived: false,
          ...(isFinding ? { action: { action_type: rand(["NETWORK_CONNECTION","PORT_PROBE","DNS_REQUEST","AWS_API_CALL"]) } } : {}),
          ...(isFinding && isDnsFinding ? { evidence: { threat_intelligence_details: [{ threat_names: [rand(["DenialOfService","CryptoCurrency","Backdoor","Trojan","UnauthorizedAccess"])], threat_list_name: rand(["ProofPoint","Emerging Threats","ThreatIntelSet"]) }] } } : {}),
        },
        metrics: {
          FindingCount: { sum: isFinding ? randInt(1,50) : 0 },
          HighSeverityFindingCount: { sum: isFinding&&sev>=7 ? randInt(1,10) : 0 },
          MediumSeverityFindingCount: { sum: isFinding&&sev>=4&&sev<7 ? randInt(1,20) : 0 },
          LowSeverityFindingCount: { sum: isFinding&&sev<4 ? randInt(1,30) : 0 },
        }
      }
    },
    "rule": { category: gdCategory, ruleset: isFinding ? ft.split(":")[0] : undefined, name: isFinding ? ft : undefined },
    "threat": { indicator:[{ type:threatIndicatorType, value:isDnsFinding?`suspicious-${randId(8).toLowerCase()}.example.com`:srcIp }] },
    ...(isFinding && isNetworkFinding ? { "source": { ip:srcIp, geo:{ country_iso_code:srcGeo.country_iso_code, country_name:srcGeo.country_name, city_name:srcGeo.city_name, location:srcGeo.location } }, "destination": { ip:dstIp } } : {}),
    "event": { kind:"alert", severity:sev, outcome:isFinding?"failure":"success", category:[gdCategory], type:["indicator"], dataset:"aws.guardduty", provider:"guardduty.amazonaws.com" },
    "message": isFinding ? `GuardDuty finding [${sevValue}]: ${ft}` : `GuardDuty: no threats detected`,
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
        region,
        description: isFinding ? `Security check failed: ${controlId} - ${rand(["MFA not enabled for root","S3 bucket is publicly accessible","Default security group allows all traffic"])}` : "Control passed.",
        created_at: createdTs,
        first_observed_at: createdTs,
        last_observed_at: ts,
        generator: { id: controlId },
        types: [findingType],
        compliance: { security_control_id: controlId, status: isFinding ? "FAILED" : "PASSED" },
        severity: { label: sev, normalized: sev==="CRITICAL"?90:sev==="HIGH"?70:sev==="MEDIUM"?40:sev==="LOW"?20:0 },
        workflow: { status: rand(["NEW","NOTIFIED","RESOLVED","SUPPRESSED"]) },
        record_state: isFinding ? "ACTIVE" : "ARCHIVED",
        product: {
          arn: `arn:aws:securityhub:${region}::product/aws/securityhub`,
          name: "Security Hub",
        },
        criticality: sev === "CRITICAL" ? 9 : sev === "HIGH" ? 7 : 4,
        confidence: randInt(70, 99),
      }
    },
    "rule": { id: controlId, name: `${controlId} — ${rand(["MFA not enabled for root","S3 bucket publicly accessible","Security group allows all traffic","CloudTrail not enabled","VPC flow logs disabled"])}` },
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
  const isErr = Math.random() < er;
  const findingType = rand(["PACKAGE_VULNERABILITY","PACKAGE_VULNERABILITY","PACKAGE_VULNERABILITY","NETWORK_REACHABILITY","CODE_VULNERABILITY"]);
  const severity = isErr ? rand(["CRITICAL","HIGH"]) : rand(["MEDIUM","LOW","INFORMATIONAL","HIGH"]);
  const resourceType = rand(["AWS_EC2_INSTANCE","AWS_ECR_CONTAINER_IMAGE","AWS_LAMBDA_FUNCTION","AWS_EC2_INSTANCE"]);
  const cvssScore = severity === "CRITICAL" ? parseFloat(randFloat(9.0, 10.0)) : severity === "HIGH" ? parseFloat(randFloat(7.0, 8.9)) : severity === "MEDIUM" ? parseFloat(randFloat(4.0, 6.9)) : parseFloat(randFloat(0.1, 3.9));
  const cveId = `CVE-${randInt(2020,2024)}-${randInt(10000,99999)}`;
  const packageName = rand(["openssl","libssl","curl","log4j","spring-core","jackson-databind","lodash","axios","requests","werkzeug"]);
  const packageVersion = `${randInt(1,3)}.${randInt(0,20)}.${randInt(0,10)}`;
  const fixedVersion = `${randInt(1,3)}.${randInt(0,20)}.${randInt(11,20)}`;
  const resourceId = resourceType === "AWS_EC2_INSTANCE" ? `i-${randId(17).toLowerCase()}` :
    resourceType === "AWS_ECR_CONTAINER_IMAGE" ? `${acct.id}.dkr.ecr.${region}.amazonaws.com/my-repo:latest` :
    `arn:aws:lambda:${region}:${acct.id}:function:my-fn`;
  const exploitability = rand(["NOT_DEFINED","PROOF_OF_CONCEPT","FUNCTIONAL","HIGH","NOT_DEFINED","NOT_DEFINED"]);
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"inspector2" } },
    "aws": {
      dimensions: { Severity: severity },
      inspector2: {
        finding_id: `arn:aws:inspector2:${region}:${acct.id}:finding/${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase(),
        finding_type: findingType,
        finding_status: rand(["ACTIVE","ACTIVE","ACTIVE","SUPPRESSED"]),
        severity,
        severity_score: parseFloat(cvssScore.toFixed(1)),
        exploitability,
        resource_type: resourceType,
        resource_id: resourceId,
        first_observed_at: new Date(new Date(ts).getTime() - randInt(1,30)*86400000).toISOString(),
        last_observed_at: ts,
        ...(findingType === "PACKAGE_VULNERABILITY" ? {
          package_vulnerability: {
            cve_id: cveId,
            source: rand(["NVD","GHSA"]),
            cvss3_score: cvssScore,
            vulnerable_packages: [{ name: packageName, version: packageVersion, fixed_in_version: fixedVersion, package_manager: rand(["OS","PYTHON","NPM","JAVA","DOTNET"]) }],
            related_vulnerabilities: Math.random() < 0.3 ? [`CVE-${randInt(2020,2024)}-${randInt(10000,99999)}`] : [],
          }
        } : findingType === "NETWORK_REACHABILITY" ? {
          network_reachability: {
            protocol: rand(["TCP","UDP"]),
            open_port_range: { begin: rand([22,80,443,3306,5432,6379,8080]), end: rand([22,80,443,3306,5432,6379,8080]) },
            network_path: rand(["sg -> igw","sg -> nat -> igw","sg -> vpc-peering"]),
          }
        } : {
          code_vulnerability: {
            cwes: [rand(["CWE-89","CWE-79","CWE-20","CWE-287","CWE-311"])],
            detector_name: rand(["CodeGuru Detector","Semgrep"]),
            file_path: { name: rand(["app.py","handler.js","main.go","Controller.java"]), line_number: randInt(10, 500) },
          }
        }),
        metrics: {
          TotalFindings: { sum: randInt(1, 500) },
          CriticalFindings: { sum: severity === "CRITICAL" ? randInt(1, 50) : 0 },
          HighFindings: { sum: severity === "HIGH" ? randInt(1, 100) : 0 },
          MediumFindings: { sum: severity === "MEDIUM" ? randInt(1, 200) : 0 },
          LowFindings: { sum: ["LOW","INFORMATIONAL"].includes(severity) ? randInt(1, 300) : 0 },
          CoveredResources: { avg: randInt(10, 5000) },
        }
      }
    },
    "vulnerability": { severity, id: findingType === "PACKAGE_VULNERABILITY" ? cveId : undefined, score: { base: cvssScore } },
    "package": findingType === "PACKAGE_VULNERABILITY" ? { name: packageName, version: packageVersion } : undefined,
    "event": { outcome: ["CRITICAL","HIGH"].includes(severity)?"failure":"success", category:["vulnerability"], type:["info"], dataset:"aws.inspector2", provider:"inspector2.amazonaws.com" },
    "message": findingType === "PACKAGE_VULNERABILITY" ? `Inspector2 [${severity}]: ${cveId} in ${packageName} ${packageVersion} on ${resourceType} (fix: ${fixedVersion})` : `Inspector2 [${severity}]: ${findingType} detected on ${resourceType}`,
    "log": { level: ["CRITICAL","HIGH"].includes(severity) ? "error" : severity === "MEDIUM" ? "warn" : "info" },
    ...(["CRITICAL","HIGH"].includes(severity) ? { error: { code: cveId, message: `${severity} vulnerability: ${packageName}`, type: "vulnerability" } } : {})
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
  const userPoolId = `${region}_${randId(9)}`;
  const action = rand(["SignIn","SignUp","ForgotPassword","ConfirmSignUp","TokenRefresh","AdminCreateUser","SignIn","SignIn"]);
  const user = `user-${randId(8).toLowerCase()}@example.com`;
  const signIns = randInt(100, 10000);
  const tokenRefreshes = randInt(500, 50000);
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"cognito" } },
    "aws": {
      dimensions: { UserPool: userPoolId, UserPoolClient: `${pool}-web` },
      cognito: {
        user_pool_id: userPoolId,
        user_pool_name: pool,
        event_type: action,
        username: isErr ? null : user,
        error_code: isErr ? rand(["NotAuthorizedException","UserNotFoundException","TooManyRequestsException"]) : null,
        source_ip: randIp(),
        mfa_type: Math.random() > 0.7 ? rand(["SOFTWARE_TOKEN_MFA","SMS_MFA"]) : null,
        metrics: {
          SignInSuccesses: { sum: isErr ? 0 : signIns },
          SignInAttempts: { sum: signIns + (isErr ? randInt(10, 500) : 0) },
          TokenRefreshSuccesses: { sum: isErr ? 0 : tokenRefreshes },
          SignUpSuccesses: { sum: action === "SignUp" && !isErr ? randInt(1, 100) : 0 },
          FederationSuccesses: { sum: Math.random() > 0.8 ? randInt(1, 500) : 0 },
          CallCount: { sum: randInt(1000, 100000) },
          ThrottleCount: { sum: isErr ? randInt(1, 100) : 0 },
          AccountTakeoverRisk: { sum: isErr ? randInt(0, 5) : 0 },
          CompromisedCredentialsRisk: { sum: isErr ? randInt(0, 3) : 0 },
        },
      },
    },
    "user": { name: isErr ? null : user },
    "source": { ip: randIp() },
    "event": { action, outcome: isErr ? "failure" : "success", category: ["authentication"], dataset: "aws.cognito", provider: "cognito-idp.amazonaws.com" },
    "message": isErr
      ? `Cognito ${action} FAILED: ${rand(["Incorrect password","User not found","Rate limit exceeded"])}`
      : `Cognito ${action} success [${pool}]`,
    "log": { level: isErr ? "warn" : "info" },
    ...(isErr ? { error: { code: rand(["NotAuthorizedException","UserNotFoundException","TooManyRequestsException"]), message: "Authentication failed", type: "authentication" } } : {}),
  };
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

function generateVerifiedAccessLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const user = rand(["alice@example.com","bob@example.com","carol@example.com","deploy-svc@example.com","contractor@partner.com"]);
  const app = rand(["internal-dashboard","admin-portal","dev-tools","staging-api","git-server"]);
  const trustProvider = rand(["iam-identity-center","oidc-okta","oidc-azure-ad","oidc-okta"]);
  const devicePosture = isErr ? rand(["NON_COMPLIANT","UNKNOWN"]) : rand(["COMPLIANT","COMPLIANT","COMPLIANT","UNKNOWN"]);
  const denied = isErr || devicePosture === "NON_COMPLIANT";
  const denyReason = denied ? rand(["device_compliance_check_failed","mfa_required","trust_provider_unavailable","policy_evaluation_failed"]) : null;
  const httpMethod = rand(HTTP_METHODS);
  const httpPath = rand(HTTP_PATHS);
  const httpStatus = denied ? rand([401,403]) : rand([200,200,201,204]);
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"verified-access" } },
    "aws": {
      dimensions: { ApplicationId: `va-app-${randId(8).toLowerCase()}` },
      verifiedaccess: {
        endpoint_id: `vae-${randId(17).toLowerCase()}`,
        group_id: `vag-${randId(17).toLowerCase()}`,
        instance_id: `vai-${randId(17).toLowerCase()}`,
        policy_name: rand(["require-mfa","corporate-device","require-mfa-and-device","jump-server-only"]),
        trust_provider_type: trustProvider,
        device_posture: devicePosture,
        verdict: denied ? "deny" : "allow",
        deny_reason: denyReason,
        http_method: httpMethod,
        http_path: httpPath,
        http_status: httpStatus,
        request_id: randUUID(),
        connection_id: randId(20),
        session_id: randId(32),
        sni_hostname: `${app}.internal.example.com`,
        application_name: app,
      }
    },
    "user": { email: user, name: user.split("@")[0] },
    "source": { ip: randIp() },
    "event": { outcome: denied?"failure":"success", category:["authentication","network"], type:[denied?"denied":"allowed"], dataset:"aws.verifiedaccess", provider:"verified-access.amazonaws.com", duration: randInt(1, 200)*1e6 },
    "message": denied ? `Verified Access DENIED: ${user} -> ${app} [${denyReason}]` : `Verified Access allowed: ${user} -> ${app} (${devicePosture})`,
    "log": { level: denied ? "warn" : "info" },
    ...(denied ? { error: { code: "AccessDenied", message: `Verified Access policy denied: ${denyReason}`, type: "authentication" } } : {})
  };
}

function generateSecurityLakeLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const ocsfClass = rand(["API_ACTIVITY","API_ACTIVITY","NETWORK_ACTIVITY","NETWORK_ACTIVITY","DNS_ACTIVITY","HTTP_ACTIVITY","AUTHENTICATION","SECURITY_FINDING"]);
  const classMap = {
    API_ACTIVITY:     { class_uid: 6003, class_name: "API Activity",     category_uid: 6, category_name: "Application Activity",              source_type: "LAMBDA:CloudTrail" },
    NETWORK_ACTIVITY: { class_uid: 4001, class_name: "Network Activity",  category_uid: 4, category_name: "Network Activity",                  source_type: "LAMBDA:VpcFlow" },
    DNS_ACTIVITY:     { class_uid: 4003, class_name: "DNS Activity",      category_uid: 4, category_name: "Network Activity",                  source_type: "LAMBDA:Route53" },
    HTTP_ACTIVITY:    { class_uid: 4002, class_name: "HTTP Activity",     category_uid: 4, category_name: "Network Activity",                  source_type: "LAMBDA:ALB" },
    AUTHENTICATION:   { class_uid: 3002, class_name: "Authentication",    category_uid: 3, category_name: "Identity & Access Management Activity", source_type: "LAMBDA:CloudTrail" },
    SECURITY_FINDING: { class_uid: 2001, class_name: "Security Finding",  category_uid: 2, category_name: "Findings",                          source_type: "LAMBDA:SecurityHub" },
  };
  const cls = classMap[ocsfClass];
  const activityId = rand([1,2,3,4,5]);
  const activityName = rand(["Create","Read","Update","Delete","Other"]);
  const severityId = isErr ? rand([5,6]) : rand([1,2,3]);
  const severityName = { 1:"Informational", 2:"Low", 3:"Medium", 5:"High", 6:"Critical" }[severityId];
  const statusId = isErr ? 2 : 1;
  const srcIp = randIp(); const dstIp = randIp();
  const user = rand(["alice","bob","carol","deploy-bot","svc-account"]);
  let classFields = {};
  if (ocsfClass === "API_ACTIVITY") {
    classFields = {
      api: { operation: rand(["RunInstances","CreateBucket","AssumeRole","PutObject","CreateUser","AttachRolePolicy"]), service: { name: rand(["ec2.amazonaws.com","s3.amazonaws.com","iam.amazonaws.com","sts.amazonaws.com"]) }, request: { uid: randUUID() }, response: { code: isErr ? rand([401,403,400]) : 200 } },
      actor: { user: { uid: `arn:aws:iam::${acct.id}:user/${user}`, name: user, type: "IAMUser" }, session: { uid: `ASIA${randId(16).toUpperCase()}`, is_mfa: Math.random() < 0.7 } },
      src_endpoint: { ip: srcIp },
    };
  } else if (ocsfClass === "NETWORK_ACTIVITY") {
    const proto = rand([6,17,1]);
    classFields = {
      src_endpoint: { ip: srcIp, port: randInt(1024, 65535) },
      dst_endpoint: { ip: dstIp, port: rand([22,80,443,3306,5432,8080]) },
      connection_info: { protocol_num: proto, protocol_name: { 6:"TCP",17:"UDP",1:"ICMP" }[proto], direction: rand(["Inbound","Outbound"]), direction_id: rand([1,2]) },
      traffic: { bytes: randInt(40, 1e6), packets: randInt(1, 100) },
    };
  } else if (ocsfClass === "HTTP_ACTIVITY") {
    classFields = {
      http_request: { method: rand(HTTP_METHODS), url: { path: rand(HTTP_PATHS), hostname: `api.example.com` }, user_agent: rand(USER_AGENTS) },
      http_response: { code: isErr ? rand([400,403,500,503]) : rand([200,200,201]) },
      src_endpoint: { ip: srcIp }, dst_endpoint: { ip: dstIp },
    };
  } else if (ocsfClass === "AUTHENTICATION") {
    classFields = {
      actor: { user: { name: user, uid: `arn:aws:iam::${acct.id}:user/${user}` }, session: { is_mfa: Math.random() < 0.7, uid: `ASIA${randId(16).toUpperCase()}` } },
      auth_protocol: rand(["SAML","OIDC","IAM"]),
      src_endpoint: { ip: srcIp },
      is_mfa: Math.random() < 0.7,
    };
  } else if (ocsfClass === "SECURITY_FINDING") {
    classFields = {
      finding: { uid: randUUID(), title: rand(["UnauthorizedAccess:IAMUser/MaliciousIPCaller","CryptoCurrency:EC2/BitcoinTool","Trojan:EC2/DNSDataExfiltration","Recon:EC2/PortProbeUnprotectedPort"]), types: [rand(["TTPs/Discovery","Effects/DataExposure","TTPs/Initial Access"])], first_seen_time: new Date(new Date(ts).getTime() - randInt(1,72)*3600000).getTime(), last_seen_time: new Date(ts).getTime(), confidence_score: randInt(1,100) },
    };
  } else if (ocsfClass === "DNS_ACTIVITY") {
    classFields = {
      query: { hostname: rand([`suspicious-${randId(8)}.io`,`malware-${randId(6)}.ru`,`normal-site.com`,`api.service.com`]), type: rand(["A","AAAA","CNAME","MX","TXT"]), type_id: rand([1,28,5,15,16]) },
      src_endpoint: { ip: srcIp },
      answers: [{ rdata: dstIp, type: "A" }],
    };
  }
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"securitylake" } },
    "aws": {
      dimensions: { OcsfClass: cls.class_name, SourceType: cls.source_type },
      securitylake: {
        source_type: cls.source_type,
        class_uid: cls.class_uid,
        class_name: cls.class_name,
        category_uid: cls.category_uid,
        category_name: cls.category_name,
        activity_id: activityId,
        activity_name: activityName,
        severity_id: severityId,
        severity: severityName,
        status_id: statusId,
        status: statusId === 1 ? "Success" : "Failure",
        time: new Date(ts).getTime(),
        metadata: { version: "1.1.0", product: { name: cls.source_type.split(":")[1], vendor_name: "AWS" }, uid: randUUID() },
        ocsf_cloud: { provider: "AWS", account: { uid: acct.id }, region },
        ...classFields,
      }
    },
    "event": { outcome: isErr?"failure":"success", category:["intrusion_detection","network"], dataset:"aws.securitylake", provider:"securitylake.amazonaws.com" },
    "message": `Security Lake [${cls.class_name}/${activityName}] ${severityName}: ${cls.source_type.split(":")[1]} ${statusId === 1 ? "success" : "failure"}`,
    "log": { level: severityId >= 5 ? "error" : severityId >= 3 ? "warn" : "info" },
    ...(isErr ? { error: { code: "SecurityEvent", message: `Security Lake ${cls.class_name} failure`, type: "security" } } : {})
  };
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
  const requestId = `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
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

  // Identity — arn, access key, session context
  const userArn = `arn:aws:iam::${acct.id}:user/${user}`;
  const accessKeyId = `AKIA${randId(16).toUpperCase()}`;
  const isAssumedRole = eventName === "AssumeRole";
  const roleArn = `arn:aws:iam::${acct.id}:role/deploy-role`;
  const sessionContext = {
    mfa_authenticated: String(Math.random() < 0.3),
    creation_date: new Date(new Date(ts).getTime() - randInt(1, 3600) * 1000).toISOString(),
    ...(isAssumedRole ? {
      session_issuer: {
        type: "Role",
        principal_id: `AROA${randId(16).toUpperCase()}`,
        arn: roleArn,
        account_id: acct.id,
      }
    } : {}),
  };

  // Resources affected by the event
  const resourceMap = {
    RunInstances:          [{ arn: `arn:aws:ec2:${region}:${acct.id}:instance/i-${randId(17).toLowerCase()}`,            account_id: acct.id, type: "AWS::EC2::Instance" }],
    CreateBucket:          [{ arn: `arn:aws:s3:::my-bucket-${randId(6).toLowerCase()}`,                                  account_id: acct.id, type: "AWS::S3::Bucket" }],
    PutObject:             [{ arn: `arn:aws:s3:::prod-data`,                                                             account_id: acct.id, type: "AWS::S3::Bucket" }],
    CreateRole:            [{ arn: `arn:aws:iam::${acct.id}:role/new-role-${randId(6).toLowerCase()}`,                  account_id: acct.id, type: "AWS::IAM::Role" }],
    CreateFunction20150331:[{ arn: `arn:aws:lambda:${region}:${acct.id}:function:fn-${randId(6).toLowerCase()}`,        account_id: acct.id, type: "AWS::Lambda::Function" }],
    CreateSecurityGroup:   [{ arn: `arn:aws:ec2:${region}:${acct.id}:security-group/sg-${randId(8).toLowerCase()}`,    account_id: acct.id, type: "AWS::EC2::SecurityGroup" }],
  };
  const resources = resourceMap[eventName];

  // Request parameters as JSON string (keyword field in official schema)
  const reqParams = isErr ? undefined :
    eventName === "CreateBucket" ? JSON.stringify({ bucketName: `my-bucket-${randId(6).toLowerCase()}` }) :
    eventName === "PutObject"    ? JSON.stringify({ bucketName: "prod-data", key: "uploads/file.json" }) :
    eventName === "AssumeRole"   ? JSON.stringify({ roleArn, roleSessionName: `${user}-session` }) : undefined;

  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"cloudtrail" } },
    "aws": {
      dimensions: { EventName:eventName, EventSource:ev.svc },
      cloudtrail: {
        event_version:      "1.08",
        event_category:     eventName === "ConsoleLogin" ? "SignIn" : "Management",
        event_type:         eventType,
        request_id:         requestId,
        api_version:        "2012-10-17",
        management_event:   true,
        read_only:          readOnly,
        recipient_account_id: acct.id,
        user_identity: {
          type:           isAssumedRole ? "AssumedRole" : "IAMUser",
          arn:            userArn,
          access_key_id:  accessKeyId,
          session_context: sessionContext,
        },
        ...(resources ? { resources } : {}),
        ...(reqParams ? { request_parameters: reqParams } : {}),
        ...(isErr ? { response_elements: JSON.stringify({ errorCode }), error_code: errorCode, error_message: "User is not authorized to perform this operation" } : {}),
        ...(eventName === "ConsoleLogin" ? {
          console_login: {
            additional_eventdata: {
              mobile_version: false,
              login_to: `https://${acct.id}.signin.aws.amazon.com/console`,
              mfa_used: Math.random() < 0.8,
            }
          }
        } : {}),
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

export { generateGuardDutyLog, generateSecurityHubLog, generateMacieLog, generateInspectorLog, generateConfigLog, generateAccessAnalyzerLog, generateCognitoLog, generateKmsLog, generateSecretsManagerLog, generateAcmLog, generateIamIdentityCenterLog, generateDetectiveLog, generateCloudTrailLog, generateVerifiedAccessLog, generateSecurityLakeLog };

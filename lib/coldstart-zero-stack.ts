import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import * as fs from "fs";
export class ColdstartZeroStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const ENABLE_PRESIGN = true;

    //this origin is never actually hit, but every cloudfront distribution needs an origin
    const origin = new s3.Bucket(this, "Origin", {
      bucketName: `coldstart-zero-origin-${this.account}-${this.region}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const intrinsicFunctions = new cloudfront.Function(
      this,
      "IntrinsicFunctions",
      {
        code: cloudfront.FunctionCode.fromFile({
          filePath: "cloudfront-functions/intrinsicFunctions.js",
        }),
        runtime: cloudfront.FunctionRuntime.JS_2_0,
        functionName: "czIntrinsicFunctions",
      }
    );

    let presignFunction: cloudfront.Function | undefined;

    if (ENABLE_PRESIGN) {
      assert(
        isDefined(process.env.COLDSTART_ZERO_USER_AK),
        "env variable COLDSTART_ZERO_USER_AK must be set to your AWS access key for presigning S3 URLs"
      );
      assert(
        isDefined(process.env.COLDSTART_ZERO_USER_SK),
        "env variable COLDSTART_ZERO_USER_SK must be set to your AWS secret key for presigning S3 URLs"
      );
      const kvStore = new cloudfront.KeyValueStore(this, "KeyValueStore", {
        keyValueStoreName: "ColdstartZeroKVStore",
        source: cloudfront.ImportSource.fromInline(
          JSON.stringify({
            data: [
              {
                key: "ACCESS_KEY",
                value: process.env.COLDSTART_ZERO_USER_AK,
              },
              {
                key: "SECRET_KEY",
                value: process.env.COLDSTART_ZERO_USER_SK,
              },
            ],
          })
        ),
      });

      presignFunction = new cloudfront.Function(this, "PreSignFunction", {
        code: cloudfront.FunctionCode.fromInline(
          fs
            .readFileSync("cloudfront-functions/presign.js", "utf8")
            .toString()
            .replace("KVSTORE_ID", kvStore.keyValueStoreId)
        ),
        runtime: cloudfront.FunctionRuntime.JS_2_0,
        functionName: "czPreSign",
        keyValueStore: kvStore,
      });
    }

    let distro = new cloudfront.Distribution(this, "distro", {
      defaultBehavior: {
        origin: new origins.S3Origin(origin),
        functionAssociations: [
          {
            function: intrinsicFunctions,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      },
      additionalBehaviors: ENABLE_PRESIGN
        ? {
            "presign/*": {
              origin: new origins.S3Origin(origin),
              functionAssociations: [
                {
                  function: presignFunction!,
                  eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
                },
              ],
              cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            },
          }
        : undefined,
    });

    new cdk.CfnOutput(this, "Distribution", {
      value: `https://${distro.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, "DistributionULID", {
      value: `https://${distro.distributionDomainName}/ulid`,
    });
    new cdk.CfnOutput(this, "DistributionSortByPath", {
      value: `https://${distro.distributionDomainName}/sortByPath?arr=[{%22date%22:%2212-31-06%22},{%22date%22:%2212-31-23%22},{%22date%22:%2212-31-19%22}]&path=date`,
    });

    if (ENABLE_PRESIGN) {
      new cdk.CfnOutput(this, "DistributionPresign", {
        value: `https://${distro.distributionDomainName}/presign/<bucket>.s3.<region>.amazonaws.com/<path>`,
      });
    }
  }
}

function isDefined(x: string | undefined | null) {
  return x !== undefined && x !== null;
}

function assert(
  condition: boolean,
  message: string | undefined = undefined
): void {
  if (!condition) throw Error("Assert failed: " + (message || ""));
}

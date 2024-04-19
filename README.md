# CloudFront Functions as a REST API

This is the companion repo for this blog post: [Coldstart Zero: CloudFront Functions as a REST API](https://speedrun.nobackspacecrew.com/blog/2024/04/20/using-cloudfront-functions-as-a-rest-api.html)

## Interesting files
1. [`lib/coldstart-zero-stack.ts`](lib/coldstart-zero-stack.ts) - The CDK stack that creates the CloudFront distribution, KV store to store the IAM user credentials, a dummy S3 origin and the CloudFront functions
1. [`cloudfront-functions/intrinsicFunctions.js`](cloudfront-functions/instrinsicFunctions.js): The cloudfront function to generate ULIDs and sort an array of objects by a path
1. [`cloudfront-functions/presign.js`](cloudfront-functions/presign.js)  The cloudfront function to generate presigned urls

## Setup

```
npm install
```
If you've never used the CDK before, run:

```
npx cdk bootstrap
```

### Presign function
If you don't want to test the presign functionality, set `ENABLE_PRESIGN` to `false` in `lib/cloudfront-functions-stack.ts`.

To use the S3 `presign` function, you'll need to create an IAM user,  set the user credentials as environment variables and have an S3 bucket with some files you want to provide presigned URLs to.

The IAM user must have a policy that grants access to the S3 bucket you'd like to generate presigned URLs for. To be able to create presigned urls for any file in a specific bucket, the policy should look something like this:

```json
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Effect": "Allow",
			"Action": "s3:GetObject",
			"Resource": "arn:aws:s3:::<YOUR-BUCKET_NAME>/*"
		}
	]
}
```
Make sure the bucket exists and has at least 1 file in it to test.

Set the following environment variables to the access key and secret key of the IAM user you just created (tweak based on your shell and OS):

```shell
export COLDSTART_ZERO_USER_AK=<YOUR_AWS_ACCESS_KEY_ID>
export COLDSTART_ZERO_USER_SK=<YOUR_AWS_SECRET_ACCESS_KEY>
```

## Deploy

```
npx cdk deploy
```

## Usage
**Outputs** will print a few urls that you can use to test the functions, replace the placeholders as appropriate.

```
ColdstartZeroStack.Distribution = https://dxxxxxxxxxxxx.cloudfront.net
ColdstartZeroStack.DistributionPresign = https://dxxxxxxxxxxxx.cloudfront.net/presign/<bucket>.s3.<region>.amazonaws.com/<path>
ColdstartZeroStack.DistributionSortByPath = https://dxxxxxxxxxxxx.cloudfront.net/sortByPath?arr=[{%22date%22:%2212-31-06%22},{%22date%22:%2212-31-23%22},{%22date%22:%2212-31-19%22}]&path=date
ColdstartZeroStack.DistributionULID = https://dxxxxxxxxxxxx.cloudfront.net/ulid
```

## Tearing it down
```
npx cdk destroy
```

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template

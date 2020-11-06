resource "aws_sns_topic_subscription" "elastic_destination_subscription" {
  topic_arn = var.sns_topic_arn
  protocol  = "lambda"
  endpoint  = module.lambda_send_alert_slack.lambda_arn
}

resource "aws_lambda_permission" "allow_invocation_from_sns_elastic_dest_sub" {
  statement_id  = "AllowExecutionFromSNSSendAlertsMessagesSlack"
  action        = "lambda:InvokeFunction"
  function_name = module.lambda_send_alert_slack.lambda_arn
  principal     = "sns.amazonaws.com"
  source_arn    = var.sns_topic_arn
}

resource "aws_sns_topic_policy" "elastic_destination_policy" {
  arn    = var.sns_topic_arn
  policy = data.aws_iam_policy_document.elastic_destination_policy.json
}

data "aws_iam_policy_document" "elastic_destination_policy" {
  statement {
    effect = "Allow"

    actions = [
      "SNS:GetTopicAttributes",
      "SNS:SetTopicAttributes",
      "SNS:AddPermission",
      "SNS:RemovePermission",
      "SNS:DeleteTopic",
      "SNS:Subscribe",
      "SNS:ListSubscriptionsByTopic",
      "SNS:Publish",
      "SNS:Receive",
    ]

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceOwner"

      values = [
        var.account_id,
      ]
    }

    resources = [
      var.sns_topic_arn,
    ]
  }
}
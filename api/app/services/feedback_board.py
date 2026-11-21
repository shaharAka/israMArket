"""Send a support report to the configured private GitHub board as a draft."""
import logging
from urllib.parse import urljoin

import httpx
from sqlalchemy import update

from app.config import get_settings
from app.models import FeedbackEvidence, SupportMessage, SupportTicket
from app.services.support import clean

log = logging.getLogger(__name__)
PROJECT = """query($id:ID!) { node(id:$id) { ... on ProjectV2 { public closed } } }"""
ADD_REPORT = """
mutation($input:AddProjectV2DraftIssueInput!) {
  addProjectV2DraftIssue(input:$input) { projectItem { id } }
}
"""


def _graphql(client, query, variables):
    response = client.post("https://api.github.com/graphql", json={"query": query, "variables": variables})
    response.raise_for_status()
    result = response.json()
    if result.get("errors"):
        raise ValueError("GitHub rejected the operation")
    return result["data"]


def publish(db, ticket_id):
    settings = get_settings()
    if not settings.feedback_github_token or not settings.feedback_github_project_id:
        return

    # A retry can claim an unsubmitted report, never one already handed to GitHub.
    claimed = db.execute(update(FeedbackEvidence).where(
        FeedbackEvidence.ticket_id == ticket_id, FeedbackEvidence.board_state == "pending"
    ).values(board_state="sending"))
    db.commit()
    if not claimed.rowcount:
        return
    evidence = db.get(FeedbackEvidence, ticket_id)
    ticket = db.get(SupportTicket, ticket_id)
    message = db.query(SupportMessage).filter_by(ticket_id=ticket_id, role="user").order_by(SupportMessage.created_at).first()
    if not (evidence and ticket and message):
        return

    prefix = "Bug" if ticket.category == "bug" else "Suggestion"
    description = clean(message.body, for_model=True)
    headline = " ".join(description.split())[:95]
    # Render untrusted report text as plain text inside Markdown. Only the app adds links.
    quoted = "\n".join("    " + line for line in description.splitlines())
    body = f"{quoted}\n\nScreen: `{ticket.page or '/'}`\n\nReport ID: `{ticket_id}`"
    if evidence.screenshot:
        link = urljoin(settings.web_origin, f"/support/screenshot/{ticket_id}")
        body += f"\n\n[View screenshot in IsraMarket]({link})"
    db.commit()

    state, item_id = "pending", None
    try:
        with httpx.Client(headers={"Authorization": f"Bearer {settings.feedback_github_token}"}, timeout=6) as client:
            project = _graphql(client, PROJECT, {"id": settings.feedback_github_project_id}).get("node")
            if project and project.get("public") is False and project.get("closed") is False:
                # If GitHub may have received the mutation, do not create duplicates on retry.
                state = "needs_review"
                result = _graphql(client, ADD_REPORT, {"input": {
                    "projectId": settings.feedback_github_project_id,
                    "title": f"[{prefix}] {headline}",
                    "body": body,
                    "clientMutationId": ticket_id,
                }})
                item_id = result["addProjectV2DraftIssue"]["projectItem"]["id"]
                state = "sent"
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        log.warning("Feedback board delivery incomplete (%s)", state)
    db.execute(update(FeedbackEvidence).where(FeedbackEvidence.ticket_id == ticket_id).values(
        board_state=state, board_item_id=item_id,
    ))
    db.commit()

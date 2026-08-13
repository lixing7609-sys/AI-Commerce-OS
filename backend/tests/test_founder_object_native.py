from app.core.conversation.service import create_conversation
from app.core.founder_object.service import approve_object, attach_object_context, get_object, list_conversation_objects, recognize_objects


def test_conversation_recognizes_updates_and_approves_real_skill():
    conversation = create_conversation(title="Object Native Test")
    objects = recognize_objects(conversation.id, "message-one", "我们需要开发一个 Chrome Extension Skill，用来处理浏览器端的数据获取。")
    skill = next(item for item in objects if item["object_type"] == "skill")
    assert skill["name"] == "Chrome Extension Skill"
    assert skill["status"] == "draft"
    attach_object_context(skill["object_id"], conversation.id)
    updated = recognize_objects(conversation.id, "message-two", "继续开发这个 Chrome Extension Skill，并增加结构化数据获取。")
    revised = next(item for item in updated if item["object_id"] == skill["object_id"])
    assert revised["version"] == 2
    assert len(get_object(skill["object_id"])["revisions"]) == 1
    approved = approve_object(skill["object_id"])
    assert approved["status"] == "approved"
    assert approved["execution_refs"][0]["status"] == "draft"
    approved_again = approve_object(skill["object_id"])
    assert approved_again["execution_refs"] == approved["execution_refs"]

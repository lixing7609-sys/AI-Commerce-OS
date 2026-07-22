from fastapi import APIRouter, Depends, HTTPException

from app.core.edition import Edition, require_edition
from app.services.knowledge_service import KnowledgeService

router = APIRouter(
    prefix="/knowledge",
    tags=["Knowledge"],
    dependencies=[Depends(require_edition(Edition.DEVELOPER, Edition.OPERATOR))],
)


@router.get("/documents")
def list_documents():
    """
    知识库文档索引（阶段一：系统文档，不含语义检索）。

    只读取代码内置目录白名单下的 .md/.txt 文件，document_id 由
    服务端生成，不接受客户端传入的文件路径。
    """

    return KnowledgeService.list_documents()


@router.get("/documents/{document_id}")
def get_document(document_id: str):
    """
    获取单篇知识库文档详情。

    document_id 必须命中服务端扫描生成的白名单索引，
    未命中一律返回 404，不做任何文件系统兜底查找。
    """

    document = KnowledgeService.get_document(document_id)

    if document is None:
        raise HTTPException(status_code=404, detail="未找到该文档")

    return document

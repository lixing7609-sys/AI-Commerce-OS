from fastapi import APIRouter, Depends

from app.core.edition import Edition, require_edition
from app.models.listing import Listing
from app.models.listing_create import ListingCreate
from app.models.listing_update import ListingUpdate
from app.services.listing_service import ListingService

router = APIRouter(
    prefix="/listings",
    tags=["Listings"],
    dependencies=[Depends(require_edition(Edition.DEVELOPER, Edition.OPERATOR))],
)


@router.get("", response_model=list[Listing])
def get_listings():
    return ListingService.get_all_listings()


@router.post("", response_model=Listing)
def create_listing(listing: ListingCreate):
    return ListingService.create_listing(listing)


@router.put("/{listing_code}", response_model=Listing)
def update_listing(
    listing_code: str,
    listing: ListingUpdate,
):
    return ListingService.update_listing(
        listing_code,
        listing,
    )


@router.delete("/{listing_code}")
def delete_listing(listing_code: str):
    return {
        "success": ListingService.delete_listing(
            listing_code
        )
    }
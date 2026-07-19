package com.example.wms.yard.dto;

import com.example.wms.yard.entity.FloorPrice;
import lombok.Getter;

@Getter
public class FloorPriceResponse {
    private final Long warehouseId;
    private final Integer tier;
    private final Integer unitPrice;
    private final Integer minFee;

    public FloorPriceResponse(FloorPrice fp) {
        this.warehouseId = fp.getWarehouse().getId();
        this.tier = fp.getTier();
        this.unitPrice = fp.getUnitPrice();
        this.minFee = fp.getMinFee();
    }
}
